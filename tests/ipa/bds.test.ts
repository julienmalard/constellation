import log from "why-is-node-running";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { step } from "mocha-steps";

chai.should();
chai.use(chaiAsPromised);

import XLSX from "xlsx";

import { enregistrerContrôleurs } from "@/ipa/accès";
import ClientConstellation, {
  schémaFonctionSuivi,
  schémaFonctionOublier,
  adresseOrbiteValide,
  uneFois,
} from "@/ipa/client";
import { InfoColAvecCatégorie } from "@/ipa/tableaux";
import { infoAuteur, infoScore } from "@/ipa/bds";
import { schémaBd } from "@/ipa/reseau";
import { MODÉRATEUR, MEMBRE } from "@/ipa/accès/consts";
import {
  élémentDonnées,
  élémentBdListeDonnées,
  règleBornes,
} from "@/ipa/valid";

import { testAPIs, config } from "./sfipTest";
import { générerClients, attendreRésultat } from "./utils";

const LOG = false;

Object.keys(testAPIs).forEach((API) => {
  describe("BDs", function () {
    this.timeout(config.timeout);

    let fOublierClients: () => Promise<void>;
    let clients: ClientConstellation[];
    let client: ClientConstellation;
    let client2: ClientConstellation;

    let idBd: string;

    before(async () => {
      enregistrerContrôleurs();
      ({ fOublier: fOublierClients, clients } = await générerClients(2, API));
      client = clients[0];
      client2 = clients[1];
    });

    after(async () => {
      if (fOublierClients) await fOublierClients();
    });

    step("Création", async () => {
      idBd = await client.bds!.créerBd("ODbl-1_0");
      expect(adresseOrbiteValide(idBd)).to.be.true;
    });

    describe("Mes BDs", async () => {
      let fOublier: schémaFonctionOublier;
      let bds: string[];
      let idNouvelleBd: string;

      before(async () => {
        fOublier = await client.bds!.suivreBds((_bds) => (bds = _bds));
      });
      after(async () => {
        if (fOublier) fOublier();
      });
      step("La BD déjà créée est présente", async () => {
        expect(bds).to.be.an("array").with.lengthOf(1);
        expect(bds[0]).to.equal(idBd);
      });
      step("On crée une autre BD sans l'ajouter", async () => {
        idNouvelleBd = await client.bds!.créerBd("ODbl-1_0", false);
        expect(bds).to.be.an("array").with.lengthOf(1);
        expect(bds[0]).to.equal(idBd);
      });
      step("On peut l'ajouter ensuite à mes bds", async () => {
        await client.bds!.ajouterÀMesBds(idNouvelleBd);
        expect(bds).to.be.an("array").with.lengthOf(2);
        expect(bds).to.include.members([idNouvelleBd, idBd]);
      });
      step("On peut aussi l'effacer", async () => {
        await client.bds!.effacerBd(idNouvelleBd);
        expect(bds).to.be.an("array").with.lengthOf(1);
        expect(bds[0]).to.equal(idBd);
      });
    });

    describe("Noms", function () {
      let noms: { [key: string]: string };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        fOublier = await client.bds!.suivreNomsBd(idBd, (n) => (noms = n));
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Pas de noms pour commencer", async () => {
        expect(noms).to.be.empty;
      });

      step("Ajouter un nom", async () => {
        await client.bds!.sauvegarderNomBd(idBd, "fr", "Alphabets");
        expect(noms.fr).to.equal("Alphabets");
      });

      step("Ajouter des noms", async () => {
        await client.bds!.ajouterNomsBd(idBd, {
          த: "எழுத்துகள்",
          हिं: "वर्णमाला",
        });
        expect(noms).to.deep.equal({
          fr: "Alphabets",
          த: "எழுத்துகள்",
          हिं: "वर्णमाला",
        });
      });

      step("Changer un nom", async () => {
        await client.bds!.sauvegarderNomBd(idBd, "fr", "Systèmes d'écriture");
        expect(noms?.fr).to.equal("Systèmes d'écriture");
      });

      step("Effacer un nom", async () => {
        await client.bds!.effacerNomBd(idBd, "fr");
        expect(noms).to.deep.equal({ த: "எழுத்துகள்", हिं: "वर्णमाला" });
      });
    });

    describe("Descriptions", function () {
      let descrs: { [key: string]: string };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        fOublier = await client.bds!.suivreDescrBd(idBd, (d) => (descrs = d));
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Aucune description pour commencer", async () => {
        expect(descrs).to.be.empty;
      });

      step("Ajouter une description", async () => {
        await client.bds!.sauvegarderDescrBd(idBd, "fr", "Alphabets");
        expect(descrs.fr).to.equal("Alphabets");
      });

      step("Ajouter des descriptions", async () => {
        await client.bds!.ajouterDescriptionsBd(idBd, {
          த: "எழுத்துகள்",
          हिं: "वर्णमाला",
        });
        expect(descrs).to.deep.equal({
          fr: "Alphabets",
          த: "எழுத்துகள்",
          हिं: "वर्णमाला",
        });
      });

      step("Changer une description", async () => {
        await client.bds!.sauvegarderDescrBd(idBd, "fr", "Systèmes d'écriture");
        expect(descrs?.fr).to.equal("Systèmes d'écriture");
      });

      step("Effacer une description", async () => {
        await client.bds!.effacerDescrBd(idBd, "fr");
        expect(descrs).to.deep.equal({ த: "எழுத்துகள்", हिं: "वर्णमाला" });
      });
    });

    describe("Mots-clefs", function () {
      let motsClefs: string[];
      let fOublier: schémaFonctionOublier;
      let idMotClef: string;

      before(async () => {
        fOublier = await client.bds!.suivreMotsClefsBd(
          idBd,
          (m) => (motsClefs = m)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });
      step("Pas de mots-clefs pour commencer", async () => {
        expect(motsClefs).to.be.an.empty("array");
      });
      step("Ajout d'un mot-clef", async () => {
        idMotClef = await client.motsClefs!.créerMotClef();
        await client.bds!.ajouterMotsClefsBd(idBd, idMotClef);
        expect(motsClefs).to.be.an("array").of.length(1);
      });
      step("Effacer un mot-clef", async () => {
        await client.bds!.effacerMotClefBd(idBd, idMotClef);
        expect(motsClefs).to.be.an.empty("array");
      });
    });

    describe("Changer licence BD", function () {
      let idBd: string;
      let licence: string;
      let fOublier: schémaFonctionOublier;

      before(async () => {
        idBd = await client.bds!.créerBd("ODbl-1_0");
        fOublier = await client.bds!.suivreLicence(idBd, (l) => (licence = l));
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Licence originale présente", async () => {
        expect(licence).to.equal("ODbl-1_0");
      });

      step("Changement de licence", async () => {
        await client.bds!.changerLicenceBd(idBd, "ODC-BY-1_0");
        expect(licence).to.equal("ODC-BY-1_0");
      });
    });

    describe("Statut BD", function () {
      step("À faire");
    });

    describe("Auteurs", function () {
      let idBdAuteurs: string;
      const rés: { ultat?: infoAuteur[] } = {};

      let fOublier: schémaFonctionOublier;

      before(async () => {
        idBdAuteurs = await client.bds!.créerBd("ODbl-1_0");
        fOublier = await client.bds!.suivreAuteurs(
          idBdAuteurs,
          (a) => (rés.ultat = a)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Juste moi pour commencer", async () => {
        expect(rés.ultat).to.be.an("array").with.lengthOf(1);
        const moi = rés.ultat![0];
        expect(moi?.accepté).to.be.true;
        expect(moi?.idBdRacine).to.equal(client.idBdRacine);
        expect(moi?.rôle).to.equal(MODÉRATEUR);
      });

      step("Inviter un membre", async () => {
        await client.bds!.inviterAuteur(
          idBdAuteurs,
          client2.idBdRacine!,
          MEMBRE
        );
        await attendreRésultat(
          rés,
          "ultat",
          (x: infoAuteur[]) => x && x.length === 2
        );

        expect(rés.ultat).to.be.an("array").with.lengthOf(2);

        const nouvelAuteur = rés.ultat?.find(
          (x) => x.idBdRacine === client2.idBdRacine
        );
        expect(nouvelAuteur).to.exist;
        expect(nouvelAuteur?.accepté).to.be.false;
        expect(nouvelAuteur?.rôle).to.equal(MEMBRE);
      });

      step("Accepter une invitation", async () => {
        await client2.bds!.ajouterÀMesBds(idBdAuteurs);

        await attendreRésultat(
          rés,
          "ultat",
          (x: infoAuteur[]) => x && x[1]?.accepté
        );

        const nouvelAuteur = rés.ultat?.find(
          (x) => x.idBdRacine === client2.idBdRacine
        );
        expect(nouvelAuteur?.accepté).to.be.true;
      });

      step("Promotion à modérateur", async () => {
        await client.bds!.inviterAuteur(
          idBdAuteurs,
          client2.idBdRacine!,
          MODÉRATEUR
        );

        await attendreRésultat(
          rés,
          "ultat",
          (x: infoAuteur[]) => x && x[1]?.rôle === MODÉRATEUR
        );

        const nouvelAuteur = rés.ultat?.find(
          (x) => x.idBdRacine === client2.idBdRacine
        );
        expect(nouvelAuteur?.accepté).to.be.true; // L'acceptation de l'invitation est toujours valide
        expect(nouvelAuteur?.rôle).to.equal(MODÉRATEUR);
      });
    });

    describe("Tableaux", function () {
      let tableaux: string[];
      let fOublier: schémaFonctionOublier;
      let idTableau: string;

      before(async () => {
        fOublier = await client.bds!.suivreTableauxBd(
          idBd,
          (t) => (tableaux = t)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Pas de tableaux pour commencer", async () => {
        expect(tableaux).to.be.an.empty("array");
      });

      step("Ajout d'un tableau", async () => {
        idTableau = await client.bds!.ajouterTableauBd(idBd);
        expect(adresseOrbiteValide(idTableau)).to.be.true;
        expect(tableaux).to.be.an("array").of.length(1);
        expect(tableaux[0]).to.equal(idTableau);
      });

      step("Effacer un tableau", async () => {
        await client.bds!.effacerTableauBd(idBd, idTableau);
        expect(tableaux).to.be.an.empty("array");
      });
    });

    describe("Variables", function () {
      let variables: string[];
      let fOublier: schémaFonctionOublier;
      let idTableau: string;
      let idVariable: string;
      let idColonne: string;

      before(async () => {
        fOublier = await client.bds!.suivreVariablesBd(
          idBd,
          (v) => (variables = v)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });
      step("Pas de variables pour commencer", async () => {
        expect(variables).to.be.an.empty("array");
      });
      step("Ajout d'un tableau et d'une variable", async () => {
        idTableau = await client.bds!.ajouterTableauBd(idBd);
        idVariable = await client.variables!.créerVariable("numérique");

        idColonne = await client.tableaux!.ajouterColonneTableau(
          idTableau,
          idVariable
        );

        expect(variables).to.be.an("array").of.length(1);
        expect(variables[0]).to.equal(idVariable);
      });
      step("Effacer une variable", async () => {
        await client.tableaux!.effacerColonneTableau(idTableau, idColonne);
        expect(variables).to.be.an.empty("array");
      });
    });

    describe("Copier BD", function () {
      let idBdOrig: string;
      let idBdCopie: string;

      let idMotClef: string;
      let idVariable: string;
      let idTableau: string;

      let noms: { [key: string]: string };
      let descrs: { [key: string]: string };
      let licence: string;
      let motsClefs: string[];
      let variables: string[];
      let tableaux: string[];

      const réfNoms = {
        த: "மழை",
        हिं: "बारिश",
      };
      const réfDescrs = {
        த: "தினசரி மழை",
        हिं: "दैनिक बारिश",
      };
      const réfLicence = "ODbl-1_0";

      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        idBdOrig = await client.bds!.créerBd(réfLicence);

        await client.bds!.ajouterNomsBd(idBdOrig, réfNoms);
        await client.bds!.ajouterDescriptionsBd(idBdOrig, réfDescrs);

        idMotClef = await client.motsClefs!.créerMotClef();
        await client.bds!.ajouterMotsClefsBd(idBdOrig, idMotClef);

        idTableau = await client.bds!.ajouterTableauBd(idBdOrig);

        idVariable = await client.variables!.créerVariable("numérique");
        await client.tableaux!.ajouterColonneTableau(idTableau, idVariable);

        idBdCopie = await client.bds!.copierBd(idBdOrig);

        fsOublier.push(
          await client.bds!.suivreNomsBd(idBdCopie, (x) => (noms = x))
        );
        fsOublier.push(
          await client.bds!.suivreDescrBd(idBdCopie, (x) => (descrs = x))
        );
        fsOublier.push(
          await client.bds!.suivreLicence(idBdCopie, (x) => (licence = x))
        );
        fsOublier.push(
          await client.bds!.suivreMotsClefsBd(idBdCopie, (x) => (motsClefs = x))
        );
        fsOublier.push(
          await client.bds!.suivreVariablesBd(idBdCopie, (x) => (variables = x))
        );
        fsOublier.push(
          await client.bds!.suivreTableauxBd(idBdCopie, (x) => (tableaux = x))
        );
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      it("Les noms sont copiés", async () => {
        expect(noms).to.deep.equal(réfNoms);
      });
      it("Les descriptions sont copiées", async () => {
        expect(descrs).to.deep.equal(réfDescrs);
      });
      it("La licence est copiée", async () => {
        expect(licence).to.equal(réfLicence);
      });
      it("Les mots-clefs sont copiés", async () => {
        expect(motsClefs).to.have.members([idMotClef]);
      });
      it("Les tableaux sont copiés", async () => {
        expect(tableaux).to.be.an("array").of.length(1);
      });
      it("Les variables sont copiées", async () => {
        expect(variables).to.have.members([idVariable]);
      });
    });

    describe("Combiner BDs", function () {
      let idVarClef: string;
      let idVarTrad: string;

      let idBd1: string;
      let idBd2: string;

      let idTableau1: string;
      let idTableau2: string;

      let données1: élémentDonnées<élémentBdListeDonnées>[];

      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        idVarClef = await client.variables!.créerVariable("chaîne");
        idVarTrad = await client.variables!.créerVariable("chaîne");

        const schéma: schémaBd = {
          licence: "ODbl-1_0",
          tableaux: [
            {
              cols: [
                {
                  idVariable: idVarClef,
                  idColonne: "clef",
                  indexe: true,
                },
                {
                  idVariable: idVarTrad,
                  idColonne: "trad",
                },
              ],
              idUnique: "tableau trads",
            },
          ],
        };

        idBd1 = await client.bds!.créerBdDeSchéma(schéma);
        idBd2 = await client.bds!.créerBdDeSchéma(schéma);

        idTableau1 = (
          await uneFois(
            async (
              fSuivi: schémaFonctionSuivi<string[]>
            ): Promise<schémaFonctionOublier> => {
              return await client.bds!.suivreTableauxBd(idBd1, fSuivi);
            }
          )
        )[0];
        idTableau2 = (
          await uneFois(
            async (
              fSuivi: schémaFonctionSuivi<string[]>
            ): Promise<schémaFonctionOublier> => {
              return await client.bds!.suivreTableauxBd(idBd2, fSuivi);
            }
          )
        )[0];

        const éléments1 = [
          {
            clef: "fr",
            trad: "Constellation",
          },
          {
            clef: "kaq", //Une trad vide, par erreur disons
          },
        ];
        for (const élément of éléments1) {
          await client.tableaux!.ajouterÉlément(idTableau1, élément);
        }

        const éléments2 = [
          {
            clef: "fr",
            trad: "Constellation!", //Une erreur ici, disons
          },
          {
            clef: "kaq",
            trad: "Ch'umil",
          },
          {
            clef: "हिं",
            trad: "तारामंडल",
          },
        ];
        for (const élément of éléments2) {
          await client.tableaux!.ajouterÉlément(idTableau2, élément);
        }

        fsOublier.push(
          await client.tableaux!.suivreDonnées(
            idTableau1,
            (d) => (données1 = d),
            true
          )
        );

        await client.bds!.combinerBds(idBd1, idBd2);
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      it("Les données sont copiées", async () => {
        const donnéesCombinées = données1.map((d) => d.données);

        expect(
          donnéesCombinées.map((d) => {
            delete d["id"];
            return d;
          })
        )
          .to.be.an("array")
          .with.lengthOf(3)
          .and.deep.members([
            { [idVarClef]: "fr", [idVarTrad]: "Constellation" },
            { [idVarClef]: "kaq", [idVarTrad]: "Ch'umil" },
            { [idVarClef]: "हिं", [idVarTrad]: "तारामंडल" },
          ]);
      });
    });

    describe("Créer BD de schéma", function () {
      let idVarClef: string;
      let idVarTrad: string;
      let idVarLangue: string;

      let idMotClef: string;

      let idBd: string;

      let tableaux: string[];
      let tableauUnique: string | undefined;

      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        idVarClef = await client.variables!.créerVariable("chaîne");
        idVarTrad = await client.variables!.créerVariable("chaîne");
        idVarLangue = await client.variables!.créerVariable("chaîne");

        idMotClef = await client.motsClefs!.créerMotClef();

        const schéma: schémaBd = {
          licence: "ODbl-1_0",
          motsClefs: [idMotClef],
          tableaux: [
            {
              cols: [
                {
                  idVariable: idVarClef,
                  idColonne: "clef",
                  indexe: true,
                },
                {
                  idVariable: idVarTrad,
                  idColonne: "trad",
                },
              ],
              idUnique: "tableau trads",
            },
            {
              cols: [
                {
                  idVariable: idVarLangue,
                  idColonne: "langue",
                  indexe: true,
                },
              ],
              idUnique: "tableau langues",
            },
          ],
        };

        idBd = await client.bds!.créerBdDeSchéma(schéma);
        fsOublier.push(
          await client.bds!.suivreTableauxBd(idBd, (t) => (tableaux = t))
        );
        fsOublier.push(
          await client.bds!.suivreTableauParIdUnique(
            idBd,
            "tableau trads",
            (t) => (tableauUnique = t)
          )
        );
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      step("Les tableaux sont créés", async () => {
        expect(tableaux).to.be.an("array").with.lengthOf(2);
      });

      step("Colonnes", async () => {
        const colonnes = await uneFois(
          async (
            fSuivi: schémaFonctionSuivi<InfoColAvecCatégorie[]>
          ): Promise<schémaFonctionOublier> => {
            return await client.tableaux!.suivreColonnes(tableaux[0], fSuivi);
          }
        );
        expect(colonnes.map((c) => c.id))
          .to.be.an("array")
          .with.lengthOf(2)
          .and.members(["clef", "trad"]);
      });

      step("Mots clefs", async () => {
        const motsClefs = await uneFois(
          async (
            fSuivi: schémaFonctionSuivi<string[]>
          ): Promise<schémaFonctionOublier> => {
            return await client.bds!.suivreMotsClefsBd(idBd, fSuivi);
          }
        );
        expect(motsClefs)
          .to.be.an("array")
          .with.lengthOf(1)
          .and.members([idMotClef]);
      });

      step("Indexe colonne", async () => {
        const indexes = await uneFois(
          async (
            fSuivi: schémaFonctionSuivi<string[]>
          ): Promise<schémaFonctionOublier> => {
            return await client.tableaux!.suivreIndexe(tableaux[0], fSuivi);
          }
        );
        expect(indexes)
          .to.be.an("array")
          .with.lengthOf(1)
          .and.members(["clef"]);
      });

      step("Tableaux unique détectable", async () => {
        expect(adresseOrbiteValide(tableauUnique)).to.be.true;
      });
    });

    describe("Suivre BD unique", function () {
      let idVarClef: string;
      let idVarTrad: string;
      let idVarLangue: string;

      let fOublier: schémaFonctionOublier;

      const rés: { ultat?: string } = {};

      before(async () => {
        idVarClef = await client.variables!.créerVariable("chaîne");
        idVarTrad = await client.variables!.créerVariable("chaîne");
        idVarLangue = await client.variables!.créerVariable("chaîne");

        const motClefUnique = await client.motsClefs!.créerMotClef();

        const schéma: schémaBd = {
          licence: "ODbl-1_0",
          motsClefs: [motClefUnique],
          tableaux: [
            {
              cols: [
                {
                  idVariable: idVarClef,
                  idColonne: "clef",
                  indexe: true,
                },
                {
                  idVariable: idVarTrad,
                  idColonne: "trad",
                },
              ],
              idUnique: "tableau trads",
            },
            {
              cols: [
                {
                  idVariable: idVarLangue,
                  idColonne: "langue",
                  indexe: true,
                },
              ],
              idUnique: "tableau langues",
            },
          ],
        };

        fOublier = await client.bds!.suivreBdUnique(
          schéma,
          motClefUnique,
          (id) => (rés.ultat = id)
        );
      });
      after(() => {
        if (fOublier) fOublier();
      });
      it("La BD est créée lorsqu'elle n'existe pas", async () => {
        await attendreRésultat(rés, "ultat");
        expect(adresseOrbiteValide(rés.ultat)).to.be.true;
      });
      it("Gestion de la concurrence entre dispositifs");
      it("Gestion de concurrence entre 2+ BDs");
    });

    describe("Suivre tableau unique", function () {
      let idBd: string;
      let idTableau: string;

      let fOublier: schémaFonctionOublier;

      const rés: { ultat?: string } = {};

      before(async () => {
        idBd = await client.bds!.créerBd("ODbl-1_0");

        idTableau = await client.bds!.ajouterTableauBd(idBd);

        fOublier = await client.bds!.suivreTableauParIdUnique(
          idBd,
          "clefUnique",
          (id) => (rés.ultat = id)
        );
      });

      after(() => {
        if (fOublier) fOublier();
      });
      it("Rien pour commencer", async () => {
        expect(rés.ultat).to.be.undefined;
      });
      it("Ajour d'id unique détecté", async () => {
        await client.tableaux!.spécifierIdUniqueTableau(
          idTableau,
          "clefUnique"
        );
        await attendreRésultat(rés, "ultat");
        expect(rés.ultat).to.equal(idTableau);
      });
    });

    describe("Suivre tableau unique de BD unique", function () {
      let idVarClef: string;
      let idVarTrad: string;

      let fOublier: schémaFonctionOublier;

      const rés: { ultat?: string } = {};

      before(async () => {
        idVarClef = await client.variables!.créerVariable("chaîne");
        idVarTrad = await client.variables!.créerVariable("chaîne");

        const motClefUnique = await client.motsClefs!.créerMotClef();

        const schéma: schémaBd = {
          licence: "ODbl-1_0",
          motsClefs: [motClefUnique],
          tableaux: [
            {
              cols: [
                {
                  idVariable: idVarClef,
                  idColonne: "clef",
                  indexe: true,
                },
                {
                  idVariable: idVarTrad,
                  idColonne: "trad",
                },
              ],
              idUnique: "id tableau unique",
            },
          ],
        };

        fOublier = await client.bds!.suivreTableauUniqueDeBdUnique(
          schéma,
          motClefUnique,
          "id tableau unique",
          (id) => (rés.ultat = id)
        );
      });
      after(() => {
        if (fOublier) fOublier();
      });

      it("Tableau unique détecté", async () => {
        await attendreRésultat(rés, "ultat");
        expect(adresseOrbiteValide(rés.ultat)).to.be.true;
      });
    });

    describe("Score", function () {
      let idBd: string;
      let idTableau: string;
      let idVarNumérique: string;
      let idVarChaîne: string;
      let idVarNumérique2: string;

      let idColNumérique: string;
      let idColNumérique2: string;

      let score: infoScore;

      let fOublier: schémaFonctionOublier;

      before(async () => {
        idBd = await client.bds!.créerBd("ODbl-1_0");
        idTableau = await client.bds!.ajouterTableauBd(idBd);

        idVarNumérique = await client.variables!.créerVariable("numérique");
        idVarNumérique2 = await client.variables!.créerVariable("numérique");
        idVarChaîne = await client.variables!.créerVariable("chaîne");

        fOublier = await client.bds!.suivreScoreBd(idBd, (s) => (score = s));
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      describe("Score accessibilité", function () {
        step("À faire");
      });

      describe("Score couverture tests", function () {
        step("`undefined` lorsque aucune colonne", async () => {
          expect(score.couverture).to.be.undefined;
        });

        step("Ajout de colonnes", async () => {
          idColNumérique = await client.tableaux!.ajouterColonneTableau(
            idTableau,
            idVarNumérique
          );
          idColNumérique2 = await client.tableaux!.ajouterColonneTableau(
            idTableau,
            idVarNumérique2
          );
          await client.tableaux!.ajouterColonneTableau(idTableau, idVarChaîne);
          expect(score.couverture).to.equal(0);
        });

        step("Ajout de règles", async () => {
          const règleNumérique: règleBornes = {
            typeRègle: "bornes",
            détails: { val: 0, op: ">=" },
          };
          await client.tableaux!.ajouterRègleTableau(
            idTableau,
            idColNumérique,
            règleNumérique
          );
          expect(score.couverture).to.equal(0.5);

          await client.tableaux!.ajouterRègleTableau(
            idTableau,
            idColNumérique2,
            règleNumérique
          );
          expect(score.couverture).to.equal(1);
        });
      });

      describe("Score validité", function () {
        let empreinteÉlément: string;

        step("`undefined` pour commencer", async () => {
          expect(score.valide).to.be.undefined;
        });

        step("Ajout d'éléments", async () => {
          empreinteÉlément = await client.tableaux!.ajouterÉlément(idTableau, {
            [idColNumérique]: -1,
            [idColNumérique2]: 1,
          });
          expect(score.valide).to.equal(0.5);
          await client.tableaux!.ajouterÉlément(idTableau, {
            [idColNumérique]: 1,
          });
          expect(score.valide).to.equal(2 / 3);
        });

        step("Correction des éléments", async () => {
          await client.tableaux!.modifierÉlément(
            idTableau,
            { [idColNumérique]: 12 },
            empreinteÉlément
          );
          expect(score.valide).to.equal(1);
        });
      });

      describe("Score total", function () {
        step("Calcul du score total", async () => {
          const total =
            ((score.accès || 0) +
              (score.couverture || 0) +
              (score.valide || 0)) /
            3;
          expect(score.total).to.equal(total);
        });
      });
    });

    describe("Exporter données", function () {
      let idBd: string;
      let doc: XLSX.WorkBook;
      let fichiersSFIP: Set<string>;

      const nomTableau1 = "Tableau 1";
      const nomTableau2 = "Tableau 2";

      before(async () => {
        idBd = await client.bds!.créerBd("ODbl-1_0");

        const idTableau1 = await client.bds!.ajouterTableauBd(idBd);
        const idTableau2 = await client.bds!.ajouterTableauBd(idBd);

        const idVarNum = await client.variables!.créerVariable("numérique");
        const idVarFichier = await client.variables!.créerVariable("fichier");
        await client.tableaux!.ajouterColonneTableau(idTableau1, idVarNum);
        const idColFichier = await client.tableaux!.ajouterColonneTableau(
          idTableau2,
          idVarFichier
        );

        await client.tableaux!.ajouterÉlément(idTableau2, {
          [idColFichier]: {
            cid: "QmNR2n4zywCV61MeMLB6JwPueAPqheqpfiA4fLPMxouEmQ",
            ext: "mp4",
          },
        });

        await client.tableaux!.ajouterNomsTableau(idTableau1, {
          fr: nomTableau1,
        });
        await client.tableaux!.ajouterNomsTableau(idTableau2, {
          fr: nomTableau2,
        });

        ({ doc, fichiersSFIP } = await client.bds!.exporterDonnées(idBd, [
          "fr",
        ]));
      });

      step("Doc créé avec tous les tableaux", () => {
        expect(doc.SheetNames)
          .to.be.an("array")
          .with.members([nomTableau1, nomTableau2]);
      });
      step("Fichiers SFIP retrouvés de tous les tableaux", () => {
        expect(fichiersSFIP.size).equal(1);
        expect(fichiersSFIP).to.have.keys([
          "QmNR2n4zywCV61MeMLB6JwPueAPqheqpfiA4fLPMxouEmQ",
        ]);
      });
    });

    describe("Rechercher BDs par mot-clef", function () {
      let résultats: string[];
      let fOublier: schémaFonctionOublier;
      let idMotClef: string;
      let idBdRechercheMotsClefs: string;

      before(async () => {
        idMotClef = await client.motsClefs!.créerMotClef();

        fOublier = await client.bds!.rechercherBdsParMotsClefs(
          [idMotClef],
          (r) => (résultats = r)
        );

        idBdRechercheMotsClefs = await client.bds!.créerBd("ODbl-1_0");
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Pas de résultats pour commencer", async () => {
        expect(résultats).to.be.an.empty("array");
      });

      step("Ajout d'un mot-clef détecté", async () => {
        await client.bds!.ajouterMotsClefsBd(idBdRechercheMotsClefs, [
          idMotClef,
        ]);
        expect(résultats).to.be.an("array").of.length(1);
        expect(résultats[0]).to.equal(idBdRechercheMotsClefs);
      });
    });
  });
});

if (LOG)
  setTimeout(function () {
    log(); // logs out active handles that are keeping node running
  }, 10000);
