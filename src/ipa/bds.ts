import { FeedStore, KeyValueStore } from "orbit-db";
import { schémaBd } from "@/ipa/réseau";

import AccessController from "orbit-db-access-controllers/src/access-controller-interface";

import ClientConstellation, {
  schémaFonctionSuivi,
  schémaFonctionOublier,
  élémentBdListe,
  infoAccès,
} from "./client";
import ContrôleurConstellation, {
  objRôles,
  nomType as nomTypeContrôleurConstellation,
} from "./accès/contrôleurConstellation";

export const STATUT = {
  ACTIVE: "active",
  OBSOLÈTE: "obsolète",
};
export interface infoAuteur {
  idBdRacine: string;
  accepté: boolean;
  rôle: keyof objRôles;
}

export interface interfaceScore {
  accès: number;
  couverture: number;
  passe: number;
  total: number;
}

export default class BDs {
  client: ClientConstellation;
  idBd: string;

  constructor(client: ClientConstellation, id: string) {
    this.client = client;
    this.idBd = id;

    this.migrerBds();
  }

  async suivreBds(
    f: schémaFonctionSuivi<string[]>,
    idBdRacine?: string
  ): Promise<schémaFonctionOublier> {
    idBdRacine = idBdRacine || this.idBd;
    return await this.client.suivreBdListe(idBdRacine, f);
  }

  async créerBd(licence: string): Promise<string> {
    const bdRacine = (await this.client.ouvrirBd(this.idBd)) as FeedStore;
    const idBdBD = await this.client.créerBdIndépendante("kvstore", {
      adresseBd: undefined,
      premierMod: this.client.bdRacine!.id,
    });
    await bdRacine.add(idBdBD);

    const bdBD = (await this.client.ouvrirBd(idBdBD)) as KeyValueStore;
    await bdBD.set("licence", licence);

    const accès = bdBD.access as unknown as ContrôleurConstellation;
    const optionsAccès = { adresseBd: accès.adresseBd };

    const idBdNoms = await this.client.créerBdIndépendante(
      "kvstore",
      optionsAccès
    );
    await bdBD.set("noms", idBdNoms);

    const idBdDescr = await this.client.créerBdIndépendante(
      "kvstore",
      optionsAccès
    );
    await bdBD.set("descriptions", idBdDescr);

    const idBdTableaux = await this.client.créerBdIndépendante(
      "feed",
      optionsAccès
    );
    await bdBD.set("tableaux", idBdTableaux);

    const idBdMotsClefs = await this.client.créerBdIndépendante(
      "feed",
      optionsAccès
    );
    await bdBD.set("motsClefs", idBdMotsClefs);

    await bdBD.set("statut", { statut: STATUT.ACTIVE });

    return idBdBD;
  }

  async copierBd(id: string): Promise<string> {
    const bdBase = (await this.client.ouvrirBd(id)) as KeyValueStore;
    const licence = await bdBase.get("licence");
    const idNouvelleBd = await this.créerBd(licence);
    const nouvelleBd = (await this.client.ouvrirBd(
      idNouvelleBd
    )) as KeyValueStore;

    const idBdNoms = await bdBase.get("noms");
    const bdNoms = (await this.client.ouvrirBd(idBdNoms)) as KeyValueStore;
    const noms = ClientConstellation.obtObjetdeBdDic(bdNoms) as {
      [key: string]: string;
    };
    await this.ajouterNomsBd(idNouvelleBd, noms);

    const idBdDescr = await bdBase.get("descriptions");
    const bdDescr = (await this.client.ouvrirBd(idBdDescr)) as KeyValueStore;
    const descriptions = ClientConstellation.obtObjetdeBdDic(bdDescr) as {
      [key: string]: string;
    };
    await this.ajouterDescriptionsBd(idNouvelleBd, descriptions);

    const idBdMotsClefs = await bdBase.get("motsClefs");
    const bdMotsClefs = (await this.client.ouvrirBd(
      idBdMotsClefs
    )) as FeedStore;
    const motsClefs = ClientConstellation.obtÉlémentsDeBdListe(
      bdMotsClefs
    ) as string[];
    await this.ajouterMotsClefsBd(idNouvelleBd, motsClefs);

    const idBdTableaux = await bdBase.get("tableaux");
    const nouvelleBdTableaux = (await nouvelleBd.get("tableaux")) as FeedStore;
    const bdTableaux = (await this.client.ouvrirBd(idBdTableaux)) as FeedStore;
    const tableaux = ClientConstellation.obtÉlémentsDeBdListe(
      bdTableaux
    ) as string[];

    tableaux.forEach(async (idT: string) => {
      const idNouveauTableau: string =
        await this.client.tableaux!.copierTableau(idT);
      await nouvelleBdTableaux.add(idNouveauTableau);
    });

    const statut = (await bdBase.get("statut")) || STATUT.ACTIVE;
    await nouvelleBd.set("statut", { statut });

    return idNouvelleBd;
  }

  async migrerBds(): Promise<void> {
    // Fonction pour migrer les BDs qui n'ont pas le bon contrôleur d'accès
    const migrerBdSiNécessaire = async (id: string): Promise<string> => {
      const bd = await this.client.ouvrirBd(id);
      bd.access.type;
      const accès = (bd.access.constructor as unknown as AccessController).type;
      if (accès !== nomTypeContrôleurConstellation) {
        const idNouvelleBd = await this.copierBd(id);
        await this.marquerObsolète(id, idNouvelleBd);
        return idNouvelleBd;
      }
      return id;
    };

    const bdRacine = (await this.client.ouvrirBd(this.idBd)) as FeedStore;
    const bdsExistantes = ClientConstellation.obtÉlémentsDeBdListe(
      bdRacine
    ) as string[];

    // Migrer les BDs si nécessaire
    bdsExistantes.forEach(async (idBd: string) => {
      const idNouvelle = await migrerBdSiNécessaire(idBd);
      if (idBd !== idNouvelle) {
        await bdRacine.add(idNouvelle);
      }
    });
  }

  async rechercherBdsParMotsClefs(
    motsClefs: string[],
    f: schémaFonctionSuivi<string[]>,
    idBdRacine?: string
  ): Promise<schémaFonctionOublier> {
    const fListe = async (
      fSuivreRacine: (éléments: string[]) => Promise<void>
    ): Promise<schémaFonctionOublier> => {
      return await this.suivreBds(fSuivreRacine, idBdRacine);
    };

    const fCondition = async (
      id: string,
      fSuivreCondition: (état: boolean) => void
    ): Promise<schémaFonctionOublier> => {
      const fFinaleSuivreCondition = (motsClefsBd: string[]) => {
        const état = motsClefs.every((m) => motsClefsBd.includes(m));
        fSuivreCondition(état);
      };
      return await this.suivreMotsClefsBd(id, fFinaleSuivreCondition);
    };
    return await this.client.suivreBdsSelonCondition(fListe, fCondition, f);
  }

  async suivreTableauBdDeSchéma(
    schéma: schémaBd,
    f: schémaFonctionSuivi<string>
  ): Promise<schémaFonctionOublier> {}

  async ajouterNomsBd(
    id: string,
    noms: { [key: string]: string }
  ): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdNoms = await this.client.obtIdBd(
      "noms",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdNoms) throw `Permission de modification refusée pour BD ${id}.`;

    const bdNoms = (await this.client.ouvrirBd(idBdNoms)) as KeyValueStore;

    for (const lng in noms) {
      await bdNoms.set(lng, noms[lng]);
    }
  }

  async sauvegarderNomBd(
    id: string,
    langue: string,
    nom: string
  ): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdNoms = await this.client.obtIdBd(
      "noms",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdNoms) throw `Permission de modification refusée pour BD ${id}.`;

    const bdNoms = (await this.client.ouvrirBd(idBdNoms)) as KeyValueStore;
    await bdNoms.set(langue, nom);
  }

  async effacerNomBd(id: string, langue: string): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdNoms = await this.client.obtIdBd(
      "noms",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdNoms) throw `Permission de modification refusée pour BD ${id}.`;

    const bdNoms = (await this.client.ouvrirBd(idBdNoms)) as KeyValueStore;
    await bdNoms.del(langue);
  }

  async ajouterDescriptionsBd(
    id: string,
    descriptions: { [key: string]: string }
  ): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdDescr = await this.client.obtIdBd(
      "descriptions",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdDescr) throw `Permission de modification refusée pour BD ${id}.`;

    const bdDescr = (await this.client.ouvrirBd(idBdDescr)) as KeyValueStore;
    for (const lng in descriptions) {
      await bdDescr.set(lng, descriptions[lng]);
    }
  }

  async sauvegarderDescrBd(
    id: string,
    langue: string,
    nom: string
  ): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdDescr = await this.client.obtIdBd(
      "descriptions",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdDescr) throw `Permission de modification refusée pour BD ${id}.`;

    const bdDescr = (await this.client.ouvrirBd(idBdDescr)) as KeyValueStore;
    await bdDescr.set(langue, nom);
  }

  async effacerDescrBd(id: string, langue: string): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdDescr = await this.client.obtIdBd(
      "descriptions",
      id,
      "kvstore",
      optionsAccès
    );
    if (!idBdDescr) throw `Permission de modification refusée pour BD ${id}.`;

    const bdDescr = (await this.client.ouvrirBd(idBdDescr)) as KeyValueStore;
    await bdDescr.del(langue);
  }

  async changerLicenceBd(idBd: string, licence: string): Promise<void> {
    const bdBd = (await this.client.ouvrirBd(idBd)) as KeyValueStore;
    await bdBd.set("licence", licence);
  }

  async ajouterMotsClefsBd(
    idBd: string,
    idsMotsClefs: string | string[]
  ): Promise<void> {
    if (!Array.isArray(idsMotsClefs)) idsMotsClefs = [idsMotsClefs];
    const optionsAccès = await this.client.obtOpsAccès(idBd);
    const idBdMotsClefs = await this.client.obtIdBd(
      "motsClefs",
      idBd,
      "feed",
      optionsAccès
    );
    if (!idBdMotsClefs)
      throw `Permission de modification refusée pour BD ${idBd}.`;

    const bdMotsClefs = (await this.client.ouvrirBd(
      idBdMotsClefs
    )) as FeedStore;
    idsMotsClefs.forEach(async (id: string) => {
      const motsClefsExistants =
        ClientConstellation.obtÉlémentsDeBdListe<string>(bdMotsClefs);
      if (!motsClefsExistants.includes(id)) await bdMotsClefs.add(id);
    });
  }

  async effacerMotClefBd(idBd: string, idMotClef: string): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(idBd);
    const idBdMotsClefs = await this.client.obtIdBd(
      "motsClefs",
      idBd,
      "feed",
      optionsAccès
    );
    if (!idBdMotsClefs)
      throw `Permission de modification refusée pour BD ${idBd}.`;

    const bdMotsClefs = (await this.client.ouvrirBd(
      idBdMotsClefs
    )) as FeedStore;

    const entrées = ClientConstellation.obtÉlémentsDeBdListe(
      bdMotsClefs,
      false
    );
    const entrée = entrées.find(
      (e: élémentBdListe) => e.payload.value === idMotClef
    );
    if (entrée) await bdMotsClefs.remove(entrée.hash);
  }

  async ajouterTableauBD(id: string): Promise<string> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    const idBdTableaux = await this.client.obtIdBd(
      "tableaux",
      id,
      "feed",
      optionsAccès
    );
    if (!idBdTableaux)
      throw `Permission de modification refusée pour BD ${id}.`;

    const bdTableaux = (await this.client.ouvrirBd(idBdTableaux)) as FeedStore;
    const idTableau = await this.client.tableaux!.créerTableau();
    await bdTableaux.add(idTableau);
    return idTableau;
  }

  async effacerTableauBD(id: string, idTableau: string): Promise<void> {
    const optionsAccès = await this.client.obtOpsAccès(id);
    // D'abord effacer l'entrée dans notre liste de tableaux
    const idBdTableaux = await this.client.obtIdBd(
      "tableaux",
      id,
      "feed",
      optionsAccès
    );
    if (!idBdTableaux)
      throw `Permission de modification refusée pour BD ${id}.`;

    const bdTableaux = (await this.client.ouvrirBd(idBdTableaux)) as FeedStore;
    const entrées = ClientConstellation.obtÉlémentsDeBdListe(bdTableaux, false);
    const entrée = entrées.find(
      (e: élémentBdListe) => e.payload.value === idTableau
    );
    if (entrée) await bdTableaux.remove(entrée.hash);

    // Enfin, effacer les données et le tableau lui-même
    await this.client.tableaux!.effacerTableau(idTableau);
  }

  async marquerObsolète(id: string, idNouvelle?: string): Promise<void> {
    const bd = (await this.client.ouvrirBd(id)) as KeyValueStore;
    bd.set("statut", { statut: STATUT.OBSOLÈTE, idNouvelle });
  }

  async suivreLicence(
    id: string,
    f: schémaFonctionSuivi<string>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBd(id, async (bd) => {
      const licence = await (bd as KeyValueStore).get("licence");
      f(licence);
    });
  }

  async suivreAuteurs(
    id: string,
    f: schémaFonctionSuivi<infoAuteur[]>
  ): Promise<schémaFonctionOublier> {
    const fListe = async (
      fSuivreRacine: (éléments: infoAccès[]) => Promise<void>
    ): Promise<schémaFonctionOublier> => {
      return await this.client.suivreAccèsBd(id, fSuivreRacine);
    };
    const fBranche = async (
      idBdRacine: string,
      fSuivreBranche: schémaFonctionSuivi<infoAuteur[]>,
      branche?: infoAccès
    ) => {
      const fFinaleSuivreBranche = (favoris?: string[]) => {
        favoris = favoris || [];
        return fSuivreBranche([
          {
            idBdRacine: branche!.idBdRacine,
            rôle: branche!.rôle,
            accepté: favoris.includes(id),
          },
        ]);
      };
      return await this.client.réseau!.suivreFavorisMembre(
        idBdRacine,
        fFinaleSuivreBranche
      );
    };
    const fIdBdDeBranche = (x: infoAccès) => x.idBdRacine;
    const fCode = (x: infoAccès) => x.idBdRacine;

    const fOublier = this.client.suivreBdsDeFonctionListe(
      fListe,
      f,
      fBranche,
      fIdBdDeBranche,
      undefined,
      fCode
    );
    return fOublier;
  }

  async suivreNomsBd(
    id: string,
    f: schémaFonctionSuivi<{ [key: string]: string }>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBdDicDeClef(id, "noms", f);
  }

  async suivreDescrBd(
    id: string,
    f: schémaFonctionSuivi<{ [key: string]: string }>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBdDicDeClef(id, "descriptions", f);
  }

  async suivreMotsClefsBd(
    id: string,
    f: schémaFonctionSuivi<string[]>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBdListeDeClef(id, "motsClefs", f);
  }

  async suivreTableauxBd(
    id: string,
    f: schémaFonctionSuivi<string[]>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBdListeDeClef(id, "tableaux", f);
  }

  async suivreScoreBd(
    id: string,
    f: schémaFonctionSuivi<interfaceScore>
  ): Promise<schémaFonctionOublier> {
    return await this.client.suivreBd(id, () => {
      const accès = Math.floor(Math.random() * 100);
      const couv = Math.floor(Math.random() * 100);
      const passe = Math.floor(Math.random() * 100);
      f({
        total: Math.floor((accès + couv + passe) / 3),
        accès: accès,
        couverture: couv,
        passe: passe,
      });
    });
  }

  async suivreVariablesBd(
    id: string,
    f: schémaFonctionSuivi<string[]>
  ): Promise<schémaFonctionOublier> {
    const fFinale = (variables?: string[]) => {
      return f(variables || []);
    };
    const fBranche = async (
      id: string,
      f: schémaFonctionSuivi<string[]>
    ): Promise<schémaFonctionOublier> => {
      return await this.client.tableaux!.suivreVariables(id, f);
    };
    const fSuivreTableaux = async (
      id: string,
      f: schémaFonctionSuivi<string[]>
    ) => {
      return await this.client.suivreBdsDeBdListe(id, f, fBranche);
    };
    return await this.client.suivreBdDeClef(
      id,
      "tableaux",
      fFinale,
      fSuivreTableaux
    );
  }

  async effacerBd(id: string): Promise<void> {
    // Dabord effacer l'entrée dans notre liste de BDs
    const bdRacine = (await this.client.ouvrirBd(this.idBd)) as FeedStore;
    const entrée = bdRacine
      .iterator({ limit: -1 })
      .collect()
      .find((e: { [key: string]: any }) => e.payload.value === id);
    await bdRacine.remove(entrée.hash);

    // Et puis maintenant aussi effacer les données et la BD elle-même
    const optionsAccès = await this.client.obtOpsAccès(id);
    for (const clef in ["noms", "descriptions", "motsClefs"]) {
      const idBd = await this.client.obtIdBd(clef, id, undefined, optionsAccès);
      if (idBd) await this.client.effacerBd(idBd);
    }
    const idBdTableaux = await this.client.obtIdBd(
      "tableaux",
      id,
      "feed",
      optionsAccès
    );
    if (idBdTableaux) {
      const bdTableaux = (await this.client.ouvrirBd(
        idBdTableaux
      )) as FeedStore;
      const tableaux = bdTableaux
        .iterator({ limit: -1 })
        .collect()
        .map((e: { [key: string]: any }) => e.payload.value);
      for (const t of tableaux) {
        await this.client.tableaux!.effacerTableau(t);
      }
    }
    await this.client.effacerBd(id);
  }
}
