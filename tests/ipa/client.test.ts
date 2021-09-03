import log from "why-is-node-running";
import { expect } from "chai";
import { step } from "mocha-steps";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import all from "it-all";
import toIt from "browser-readablestream-to-it";

import ClientConstellation, {
  adresseOrbiteValide,
  schémaFonctionSuivi,
  schémaFonctionOublier,
  faisRien,
  infoAccès,
  élémentBdListe,
} from "@/ipa/client";
import { MEMBRE, MODÉRATEUR } from "@/ipa/accès/consts";

import { KeyValueStore, FeedStore, élémentFeedStore } from "orbit-db";

import { testAPIs, config } from "./sfipTest";
import {
  générerClients,
  peutÉcrire,
  fermerBd,
  attendreRésultat,
} from "./utils";

const LOG = false;

chai.should();
chai.use(chaiAsPromised);

const assert = chai.assert;

Object.keys(testAPIs).forEach((API) => {
  describe("adresseOrbiteValide", function () {
    it("adresse orbite est valide", () => {
      const valide = adresseOrbiteValide(
        "/orbitdb/zdpuAsiATt21PFpiHj8qLX7X7kN3bgozZmhEVswGncZYVHidX/7e0cde32-7fee-487c-ad6e-4247f627488e"
      );
      expect(valide).to.be.true;
    });
    it("CID SFIP n'est pas valide", () => {
      const valide = adresseOrbiteValide(
        "QmNR2n4zywCV61MeMLB6JwPueAPqheqpfiA4fLPMxouEmQ"
      );
      expect(valide).to.be.false;
    });
  });

  describe("Client Constellation", function () {
    this.timeout(config.timeout);

    let fOublierClients: () => Promise<void>;
    let clients: ClientConstellation[];
    let client: ClientConstellation,
      client2: ClientConstellation,
      client3: ClientConstellation;

    before(async () => {
      ({ fOublier: fOublierClients, clients } = await générerClients(3, API));
      [client, client2, client3] = clients;
    });

    after(async () => {
      if (fOublierClients) await fOublierClients();
    });

    it("Le client devrait être initialisé", async () => {
      expect(client.prêt).to.be.true;
    });

    describe("Signer", function () {
      it("La signature devrait être valide", async () => {
        const message = "Je suis un message";
        const signature = await client.signer(message);
        const valide = await client.vérifierSignature(signature, message);
        expect(valide).to.be.true;
      });
      it("La signature ne devrait pas être valide pour un autre message", async () => {
        const message = "Je suis un message";
        const autreMessage = "Je suis un message!";
        const signature = await client.signer(message);
        const valide = await client.vérifierSignature(signature, autreMessage);
        expect(valide).to.be.false;
      });
    });

    describe("Contrôl dispositifs", function () {
      let fOublierDispositifs: schémaFonctionOublier;
      let fOublierIdBdRacine: schémaFonctionOublier;
      let fOublierIdOrbite: schémaFonctionOublier;

      let mesDispositifs: string[];
      let idBdRacine: string | undefined;
      let idOrbite: string | undefined;

      let idOrbiteClient3Avant: string;

      before(async () => {
        idOrbiteClient3Avant = client3.orbite!.identity.id;
        fOublierDispositifs = await client.suivreDispositifs(
          (dispositifs) => (mesDispositifs = dispositifs)
        );
        fOublierIdBdRacine = await client3.suivreIdBdRacine(
          (id) => (idBdRacine = id)
        );
        fOublierIdOrbite = await client3.suivreIdOrbite(
          (id) => (idOrbite = id)
        );
      });
      after(async () => {
        if (fOublierDispositifs) fOublierDispositifs();
        if (fOublierIdBdRacine) fOublierIdBdRacine();
        if (fOublierIdOrbite) fOublierIdOrbite();
      });
      step("Mon dispositif est présent", async () => {
        const monId = client.orbite!.identity.id;
        expect(mesDispositifs)
          .to.be.an("array")
          .that.has.lengthOf(1)
          .and.that.includes(monId);
      });
      describe("Ajouter dispositif", function () {
        let sonId: string;
        let idBd: string;

        before(async () => {
          sonId = client3.orbite!.identity.id;
          await client.ajouterDispositif(sonId);
          await client3.rejoindreCompte(client.idBdRacine!);
          idBd = await client.créerBdIndépendante("kvstore");
        });

        it("Mes dispositifs sont mis à jour", async () => {
          expect(mesDispositifs).to.have.lengthOf(2).and.to.include(sonId);
        });

        it("Le nouveau dispositif a rejoint notre compte", () => {
          expect(client3.idBdRacine).to.equal(client.idBdRacine);
        });

        it("idBdRacine est suivie correctement", async () => {
          expect(idBdRacine).to.equal(client.idBdRacine);
        });

        it("idOrbite ne change pas", async () => {
          expect(idOrbite).to.equal(idOrbiteClient3Avant);
        });

        it("Le nouveau dispositif peut modifier mes BDs", async () => {
          const bd_orbite3 = (await client3.ouvrirBd(idBd)) as KeyValueStore;
          const autorisé = await peutÉcrire(bd_orbite3, client3.orbite);
          expect(autorisé).to.be.true;
        });
      });
    });

    describe("Suivre BD", function () {
      let idBd: string;
      let bd: KeyValueStore;
      let fOublier: schémaFonctionOublier;
      let données: { [key: string]: number };

      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore");
        bd = await client.ouvrirBd(idBd);
        await bd.put("a", 1);
        const fSuivre = (_bd: KeyValueStore) => {
          const d = _bd.all;
          données = d;
        };
        fOublier = await client.suivreBd(idBd, fSuivre);
      });

      after(async () => {
        fOublier();
        await fermerBd(bd);
      });

      it("Les données initiales sont détectées", async () => {
        expect(données["a"]).to.equal(1);
      });

      it("Les changements sont détectés", async () => {
        await bd.put("b", 2);
        expect(données["b"]).to.equal(2);
      });
    });

    describe("Suivre BD de fonction", function () {
      let idBd: string;
      let idBd2: string;
      let bd: KeyValueStore;
      let bd2: KeyValueStore;
      let données: { [key: string]: number } | undefined;
      let fSuivre: (id: string) => Promise<void>;
      let fOublier: schémaFonctionOublier;

      const changerBd = async (id: string) => {
        await fSuivre(id);
      };
      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore");
        idBd2 = await client.créerBdIndépendante("kvstore");
        bd = await client.ouvrirBd(idBd);
        bd2 = await client.ouvrirBd(idBd2);
        const fRacine = async (
          fSuivreRacine: (nouvelIdBdCible: string) => Promise<void>
        ): Promise<schémaFonctionOublier> => {
          fSuivre = fSuivreRacine;
          return faisRien;
        };
        const f = (_bd?: KeyValueStore) => {
          if (_bd) données = _bd.all;
          else données = undefined;
        };
        fOublier = await client.suivreBdDeFonction(fRacine, f);
      });
      after(async () => {
        if (bd) await fermerBd(bd);
        if (bd2) await fermerBd(bd2);
        if (fOublier) fOublier();
      });
      it("`undefined` est retourné si la fonction ne renvoie pas de BD", async () => {
        expect(données).to.be.undefined;
      });
      it("Les changements à la BD suivie sont détectés", async () => {
        await changerBd(idBd);
        await bd.put("a", 1);
        expect(données).to.not.be.undefined;
        expect(données!["a"]).to.equal(1);
      });
      it("Les changements à l'id de la BD suivie sont détectés", async () => {
        await bd2.put("a", 2);
        await changerBd(idBd2);
        expect(données).to.not.be.undefined;
        expect(données!["a"]).to.equal(2);
      });
    });

    describe("Suivre BD de clef", function () {
      let idBdBase: string;
      let bdBase: KeyValueStore;
      let idBd: string | undefined;
      let bd: KeyValueStore;
      let bd2: KeyValueStore;
      const CLEF = "clef";
      let fOublier: schémaFonctionOublier;
      let données: { [key: string]: number } | undefined;

      before(async () => {
        idBdBase = await client.créerBdIndépendante("kvstore");
        bdBase = await client.ouvrirBd(idBdBase);

        const fSuivre = (_bd?: KeyValueStore) => {
          if (_bd) données = _bd.all;
          else données = undefined;
        };
        fOublier = await client.suivreBdDeClef(idBdBase, CLEF, fSuivre);
      });

      after(async () => {
        fOublier();
        if (bdBase) await fermerBd(bdBase);
        if (bd2) await fermerBd(bd2);
        if (bd) await fermerBd(bd);
      });

      it("`undefined` est retourné si la clef n'existe pas", async () => {
        expect(données).to.be.undefined;
      });

      it("Les changements à la BD suivie sont détectés", async () => {
        idBd = await client.obtIdBd(CLEF, idBdBase, "kvstore");
        bd = await client.ouvrirBd(idBd!);
        await bd.put("a", 1);
        expect(données).to.not.be.undefined;
        expect(données!["a"]).to.equal(1);
      });

      it("Les changements à la clef sont détectés", async () => {
        const idBd2 = await client.créerBdIndépendante("kvstore");
        bd2 = await client.ouvrirBd(idBd2);
        await bd2.put("a", 2);
        await bdBase.put(CLEF, idBd2);
        expect(données).to.not.be.undefined;
        expect(données!["a"]).to.equal(2);
      });
    });

    describe("Suivre BD dic de clef", function () {
      let idBdBase: string;
      let bdBase: KeyValueStore;
      let idBd: string;
      let bd: KeyValueStore;
      const CLEF = "clef";
      let données: { [key: string]: number };

      before(async () => {
        idBdBase = await client.créerBdIndépendante("kvstore");
        bdBase = await client.ouvrirBd(idBdBase);

        idBd = await client.créerBdIndépendante("kvstore");
        bd = await client.ouvrirBd(idBd);

        const fSuivre = (d: { [key: string]: number }) => (données = d);
        await client.suivreBdDicDeClef(idBdBase, CLEF, fSuivre);
      });
      after(async () => {
        if (bdBase) await fermerBd(bdBase);
      });
      it("`{}` est retourné si la clef n'existe pas", async () => {
        expect(données).to.be.empty;
      });
      it("Les données sont retournés en format objet", async () => {
        await bdBase.put(CLEF, idBd);
        expect(données).to.be.empty;

        await bd.put("a", 1);
        expect(données["a"]).to.equal(1);
      });
    });

    describe("Suivre BD liste de clef", function () {
      let idBdBase: string;
      let bdBase: KeyValueStore;
      let idBd: string;
      let bd: FeedStore;
      const CLEF = "clef";
      let donnéesValeur: number[];
      let données: élémentBdListe<number>[];

      before(async () => {
        idBdBase = await client.créerBdIndépendante("kvstore");
        bdBase = await client.ouvrirBd(idBdBase);

        idBd = await client.créerBdIndépendante("feed");
        bd = await client.ouvrirBd(idBd);

        const fSuivreValeur = (d: number[]) => (donnéesValeur = d);
        const fSuivre = (d: élémentBdListe<number>[]) => (données = d);
        await client.suivreBdListeDeClef(idBdBase, CLEF, fSuivreValeur, true);
        await client.suivreBdListeDeClef(idBdBase, CLEF, fSuivre, false);
      });
      after(async () => {
        if (bdBase) await fermerBd(bdBase);
        if (bd) await fermerBd(bd);
      });
      step("`[]` est retourné si la clef n'existe pas", async () => {
        expect(donnéesValeur).to.be.an("array").that.is.empty;
        expect(données).to.be.an("array").that.is.empty;
      });
      step("Avec renvoyer valeur", async () => {
        await bdBase.put(CLEF, idBd);
        expect(donnéesValeur).to.be.empty;

        await bd.add(1);
        await bd.add(2);
        expect(donnéesValeur).to.include.members([1, 2]);
      });
      step("Sans renvoyer valeur", async () => {
        expect(données).to.have.lengthOf(2);
        expect(données.map((d) => d.payload.value)).to.include.members([1, 2]);
      });
    });

    describe("Suivre BD liste", function () {
      let idBd: string;
      let bd: FeedStore;
      let donnéesValeur: number[];
      let données: élémentBdListe<number>[];

      before(async () => {
        idBd = await client.créerBdIndépendante("feed");
        bd = await client.ouvrirBd(idBd);

        const fSuivreValeur = (d: number[]) => (donnéesValeur = d);
        const fSuivre = (d: élémentBdListe<number>[]) => (données = d);
        await client.suivreBdListe(idBd, fSuivreValeur, true);
        await client.suivreBdListe(idBd, fSuivre, false);
      });
      after(async () => {
        if (bd) await fermerBd(bd);
      });
      it("Avec renvoyer valeur", async () => {
        expect(donnéesValeur).to.be.empty;

        await bd.add(1);
        await bd.add(2);
        expect(donnéesValeur).to.include.members([1, 2]);
      });
      it("Sans renvoyer valeur", async () => {
        expect(données).to.have.lengthOf(2);
        expect(données.map((d) => d.payload.value)).to.include.members([1, 2]);
      });
    });

    describe("Rechercher élément BD liste selon empreinte", function () {
      let idBd: string;
      let bd: FeedStore;
      before(async () => {
        idBd = await client.créerBdIndépendante("feed");
        bd = (await client.ouvrirBd(idBd)) as FeedStore;
        await bd.add("abc");
      });
      after(async () => {
        if (bd) await fermerBd(bd);
      });
      it("On retrouve le bon élément", async () => {
        const fRecherche = (e: élémentFeedStore<string>): boolean => {
          return e.payload.value === "abc";
        };
        const résultat = await client.rechercherBdListe(idBd, fRecherche);
        expect(résultat.payload.value).to.equal("abc");
      });
      it("`undefined` est retourné si l'empreinte n'existe pas", async () => {
        const fRecherche = (e: élémentFeedStore<string>): boolean => {
          return e.payload.value === "def";
        };
        const résultat = await client.rechercherBdListe(idBd, fRecherche);
        expect(résultat).to.be.undefined;
      });
    });

    describe("Suivre BDs de BD liste", function () {
      let idBdListe: string;
      let bdListe: FeedStore;
      let idBd1: string;
      let idBd2: string;
      let bd1: KeyValueStore;
      let bd2: KeyValueStore;

      type branche = { [key: string]: number };
      let données: branche[];
      let fOublier: schémaFonctionOublier;

      before(async () => {
        idBdListe = await client.créerBdIndépendante("feed");
        bdListe = await client.ouvrirBd(idBdListe);
        const fBranche = async (
          id: string,
          f: schémaFonctionSuivi<branche>
        ) => {
          return await client.suivreBd(id, (_bd: KeyValueStore) => f(_bd.all));
        };
        const fSuivi = (x: branche[]) => {
          données = x;
        };
        fOublier = await client.suivreBdsDeBdListe(idBdListe, fSuivi, fBranche);

        idBd1 = await client.créerBdIndépendante("kvstore");
        idBd2 = await client.créerBdIndépendante("kvstore");
        bd1 = await client.ouvrirBd(idBd1);
        bd2 = await client.ouvrirBd(idBd2);
        await bd1.put("a", 1);
        await bd2.put("b", 2);

        await bdListe.add(idBd1);
        await bdListe.add(idBd2);
      });
      after(async () => {
        if (fOublier) fOublier();
        if (bdListe) fermerBd(bdListe);
        if (bd1) fermerBd(bd1);
        if (bd2) fermerBd(bd2);
      });
      it("Les éléments sont retournés", async () => {
        expect(données).to.be.an("array");
        expect(données).to.deep.equal([{ a: 1 }, { b: 2 }]);
      });
    });

    describe("Suivre BDs de fonction", function () {
      describe("De liste ids BDs", function () {
        let fSuivre: (ids: string[]) => Promise<void>;
        let fOublier: schémaFonctionOublier;
        let résultats: number[];
        let bd1: KeyValueStore;
        let bd2: KeyValueStore;
        let idBd1: string;
        let idBd2: string;

        const changerBds = async (ids: string[]) => {
          await fSuivre(ids);
        };
        before(async () => {
          idBd1 = await client.créerBdIndépendante("kvstore");
          idBd2 = await client.créerBdIndépendante("kvstore");
          bd1 = await client.ouvrirBd(idBd1);
          bd2 = await client.ouvrirBd(idBd2);
          await bd1.put("a", 1);
          await bd1.put("b", 2);
          await bd2.put("c", 3);

          const fListe = async (
            fSuivreRacine: (éléments: string[]) => Promise<void>
          ): Promise<schémaFonctionOublier> => {
            fSuivre = fSuivreRacine;
            return faisRien;
          };
          const f = (x: number[]) => (résultats = x);
          const fBranche = async (
            id: string,
            f: schémaFonctionSuivi<number[]>
          ): Promise<schémaFonctionOublier> => {
            return await client.suivreBd(id, (bd: KeyValueStore) => {
              const vals: number[] = Object.values(bd.all);
              f(vals);
            });
          };
          fOublier = await client.suivreBdsDeFonctionListe(fListe, f, fBranche);
        });
        after(async () => {
          if (fOublier) fOublier();
          if (bd1) await fermerBd(bd1);
          if (bd2) await fermerBd(bd2);
        });

        it("Sans branches", async () => {
          expect(résultats).to.be.undefined;
        });
        it("Ajout d'une branche ou deux", async () => {
          await changerBds([idBd1, idBd2]);
          expect(résultats).to.be.an("array").with.lengthOf(3);
          expect(résultats).to.include.members([1, 2, 3]);
        });
        it("Enlever une branche", async () => {
          await changerBds([idBd1]);
          expect(résultats).to.be.an("array").with.lengthOf(2);
          expect(résultats).to.include.members([1, 2]);
        });
      });

      describe("Avec branches complexes", function () {
        type branche = {
          nom: string;
          id: string;
        };
        let fSuivre: (ids: branche[]) => Promise<void>;
        let fOublier: schémaFonctionOublier;
        let fOublierComplexe: schémaFonctionOublier;
        let résultats: number[];
        let bd1: KeyValueStore;
        let bd2: KeyValueStore;
        let idBd1: string;
        let idBd2: string;

        const fListe = async (
          fSuivreRacine: (éléments: branche[]) => Promise<void>
        ): Promise<schémaFonctionOublier> => {
          fSuivre = fSuivreRacine;
          return faisRien;
        };
        const f = (x: number[]) => (résultats = x);
        const fBranche = async (
          id: string,
          f: schémaFonctionSuivi<number[]>
        ): Promise<schémaFonctionOublier> => {
          return await client.suivreBd(id, (bd: KeyValueStore) => {
            const vals: number[] = Object.values(bd.all);
            f(vals);
          });
        };

        const fIdBdDeBranche = (x: branche) => x.id;
        const fCode = (x: branche) => x.id;

        const changerBds = async (ids: string[]) => {
          await fSuivre(
            ids.map((id) => {
              return { nom: "abc", id: id };
            })
          );
        };
        before(async () => {
          idBd1 = await client.créerBdIndépendante("kvstore");
          idBd2 = await client.créerBdIndépendante("kvstore");
          bd1 = await client.ouvrirBd(idBd1);
          bd2 = await client.ouvrirBd(idBd2);
          await bd1.put("a", 1);
          await bd1.put("b", 2);
          await bd2.put("c", 3);

          fOublier = await client.suivreBdsDeFonctionListe(
            fListe,
            f,
            fBranche,
            fIdBdDeBranche,
            undefined,
            fCode
          );
          await changerBds([idBd1, idBd2]);
        });
        after(async () => {
          if (fOublier) fOublier();
          if (fOublierComplexe) fOublierComplexe();
          if (bd1) await fermerBd(bd1);
          if (bd2) await fermerBd(bd2);
        });

        it("Ajout d'une branche ou deux", async () => {
          expect(résultats).to.be.an("array").with.lengthOf(3);
          expect(résultats).to.include.members([1, 2, 3]);
        });

        it("Avec fRéduction complèxe", async () => {
          const fRéduction = (branches: number[][]) => [
            ...branches.map((b) => b[0]),
          ];

          fOublierComplexe = await client.suivreBdsDeFonctionListe(
            fListe,
            f,
            fBranche,
            fIdBdDeBranche,
            fRéduction,
            fCode
          );
        });
      });

      describe("Avec branches complexes sans fCode", function () {
        type branche = {
          nom: string;
        };
        let fSuivre: (ids: branche[]) => Promise<void>;
        let fOublier: schémaFonctionOublier;
        const fListe = async (
          fSuivreRacine: (éléments: branche[]) => Promise<void>
        ): Promise<schémaFonctionOublier> => {
          fSuivre = fSuivreRacine;
          return faisRien;
        };
        before(async () => {
          fOublier = await client.suivreBdsDeFonctionListe(
            fListe,
            faisRien,
            async () => faisRien
          );
        });
        after(async () => {
          if (fOublier) fOublier();
        });

        it("Ajout d'une branche ou deux", async () => {
          assert.isRejected(fSuivre([{ nom: "abc" }]));
        });
      });
    });

    describe("Suivre BDs selon condition", function () {
      let idBd1: string;
      let idBd2: string;
      let bd1: KeyValueStore;
      let bd2: KeyValueStore;

      let sélectionnées: string[];
      let fOublier: schémaFonctionOublier;

      before(async () => {
        idBd1 = await client.créerBdIndépendante("kvstore");
        idBd2 = await client.créerBdIndépendante("kvstore");
        bd1 = await client.ouvrirBd(idBd1);
        bd2 = await client.ouvrirBd(idBd2);

        const fListe = async (
          fSuivreRacine: (ids: string[]) => Promise<void>
        ): Promise<schémaFonctionOublier> => {
          fSuivreRacine([idBd1, idBd2]);
          return faisRien;
        };
        const fCondition = async (
          id: string,
          fSuivreCondition: (état: boolean) => void
        ): Promise<schémaFonctionOublier> => {
          const f = (bd: KeyValueStore) =>
            fSuivreCondition(Object.keys(bd.all).length > 0);
          return await client.suivreBd(id, f);
        };
        fOublier = await client.suivreBdsSelonCondition(
          fListe,
          fCondition,
          (idsBds) => (sélectionnées = idsBds)
        );
      });
      after(async () => {
        if (fOublier) fOublier();
        if (bd1) await fermerBd(bd1);
        if (bd2) await fermerBd(bd2);
      });
      it("Seules les bonnes BDs sont retournées", async () => {
        expect(sélectionnées).to.be.an("array").that.is.empty;
        await bd1.put("a", 1);
        expect(sélectionnées).to.be.an("array").with.lengthOf(1);
        expect(sélectionnées).to.include.members([idBd1]);
      });
      it("Les changements aux conditions sont détectés", async () => {
        await bd2.put("a", 1);
        expect(sélectionnées).to.include.members([idBd1, idBd2]);
      });
    });

    describe("Opérations SFIP", function () {
      let cid: string;
      const texte = "வணக்கம்";
      step("On ajoute un fichier au SFIP", async () => {
        cid = await client.ajouterÀSFIP(texte);
      });
      step("On télécharge le fichier du SFIP", async () => {
        const données = await client.obtFichierSFIP(cid);
        expect(données).to.not.be.null;
        expect(new TextDecoder().decode(données!)).to.equal(texte);
      });
      it.skip("On télécharge le fichier en tant que flux", async () => {
        const flux = client.obtFluxSFIP(cid);
        expect(await all(toIt(flux))).to.equal(texte);
      });
    });

    describe("Ouvrir BD", function () {
      let idBd: string;

      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore");
      });

      it("On obtient la BD", async () => {
        const bd = await client.ouvrirBd(idBd);
        expect(adresseOrbiteValide(bd.address.toString())).to.be.true;
      });
      it("On évite la concurrence", async () => {
        const bds = await Promise.all(
          [1, 2].map(async () => {
            return await client.ouvrirBd(idBd);
          })
        );
        expect(bds[0] === bds[1]).to.be.true;
      });
    });

    describe("Obtenir ID BD", function () {
      let idRacine: string;
      let bdRacine: KeyValueStore;
      let idBd: string;

      before(async () => {
        idRacine = await client.créerBdIndépendante("kvstore");
        bdRacine = await client.ouvrirBd(idRacine);

        idBd = await client.créerBdIndépendante("feed");
        await bdRacine.put("clef", idBd);
      });

      it("Avec racine chaîne", async () => {
        const idBdRetrouvée = await client.obtIdBd("clef", idRacine);
        expect(idBdRetrouvée).to.equal(idBd);
      });

      it("Avec racine BD", async () => {
        const idBdRetrouvée = await client.obtIdBd("clef", bdRacine);
        expect(idBdRetrouvée).to.equal(idBd);
      });

      it("Avec mauvais type spécifié", async () => {
        const idBdRetrouvée = await client.obtIdBd("clef", bdRacine, "kvstore");
        expect(idBdRetrouvée).to.be.undefined;
      });

      it("On crée la BD si elle n'existait pas", async () => {
        const idBdRetrouvée = await client.obtIdBd(
          "je n'existe pas encore",
          bdRacine,
          "feed"
        );
        expect(adresseOrbiteValide(idBdRetrouvée)).to.be.true;
      });

      it("Mais on ne crée pas la BD on n'a pas la permission sur la BD racine", async () => {
        const idBdRetrouvée = await client2.obtIdBd(
          "et moi je n'existerai jamais",
          bdRacine,
          "feed"
        );
        expect(idBdRetrouvée).to.be.undefined;
      });
    });

    describe("Créer BD indépendante", function () {
      it("La BD est crée", async () => {
        const idBd = await client.créerBdIndépendante("kvstore");
        expect(adresseOrbiteValide(idBd)).to.be.true;
      });
      it("Avec sa propre bd accès l'utilisateur", async () => {
        const optionsAccès = {
          adresseBd: undefined,
          premierMod: client.bdRacine!.id,
        };
        const idBd = await client.créerBdIndépendante("kvstore", optionsAccès);

        const bd = (await client.ouvrirBd(idBd)) as KeyValueStore;
        const autorisé = await peutÉcrire(bd, client.orbite);
        expect(autorisé).to.be.true;
      });
      it("Avec accès personalisé", async () => {
        const optionsAccès = { premierMod: client2.orbite!.identity.id };
        const idBd = await client.créerBdIndépendante("kvstore", optionsAccès);

        const bd_orbite2 = (await client2.ouvrirBd(idBd)) as KeyValueStore;
        const autorisé = await peutÉcrire(bd_orbite2, client2.orbite);
        expect(autorisé).to.be.true;
      });
    });

    describe("Effacer BD", function () {
      let idBd: string;
      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore");
        const bd = (await client.ouvrirBd(idBd)) as KeyValueStore;
        await bd.put("test", 123);
        await bd.close();
      });

      it("Les données n'existent plus", async () => {
        await client.effacerBd(idBd);
        const bd = (await client.ouvrirBd(idBd)) as KeyValueStore;
        const val = await bd.get("test");
        expect(val).to.be.undefined;
      });
    });

    describe("Suivre mes permissions", function () {
      const rés = { ultat: undefined as string | undefined };
      let idBd: string;
      let oublier: schémaFonctionOublier;

      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore", {
          adresseBd: undefined,
          premierMod: client.bdRacine!.id,
        });

        oublier = await client2.suivrePermission(idBd, (p) => {
          rés.ultat = p;
        });
      });

      step("On n'a pas d'accès avant", async () => {
        expect(rés.ultat).to.be.undefined;
      });

      step("On détecte l'ajout d'une permission membre", async () => {
        await client.donnerAccès(idBd, client2.idBdRacine!, MEMBRE);
        await attendreRésultat(rés, "ultat");
        expect(rés.ultat).to.equal(MEMBRE);
      });

      step("Le nouveau membre peut modifier la BD", async () => {
        const bd = (await client2.ouvrirBd(idBd)) as KeyValueStore;
        const permission = await peutÉcrire(bd, client2.orbite);
        expect(permission).to.be.true;
      });

      step("On détecte l'ajout d'une permission modératrice", async () => {
        await client.donnerAccès(idBd, client2.idBdRacine!, MODÉRATEUR);
        await attendreRésultat(rés, "ultat", MODÉRATEUR);
        expect(rés.ultat).to.equal(MODÉRATEUR);
      });

      after(async () => {
        if (oublier) oublier();
      });
    });

    describe("Suivre accès et permissions BD", function () {
      let fOublier: schémaFonctionOublier;
      let fOublierÉcrire: schémaFonctionOublier;
      let fOublierPermission: schémaFonctionOublier;

      let lAccès: infoAccès[];
      let idBd: string;
      const résultatPermission = {
        permission: undefined as typeof MODÉRATEUR | typeof MEMBRE | undefined,
      };
      let permissionÉcrire = false;

      before(async () => {
        idBd = await client.créerBdIndépendante("kvstore", {
          adresseBd: undefined,
          premierMod: client.bdRacine!.id,
        });
        const f = (accès: infoAccès[]) => {
          lAccès = accès;
        };
        fOublier = await client.suivreAccèsBd(idBd, f);

        const fÉcrire = (accès: boolean) => {
          permissionÉcrire = accès;
        };
        fOublierÉcrire = await client2.suivrePermissionÉcrire(idBd, fÉcrire);

        const fPermission = (accès?: typeof MODÉRATEUR | typeof MEMBRE) => {
          résultatPermission["permission"] = accès;
        };
        fOublierPermission = await client2.suivrePermission(idBd, fPermission);
      });
      after(async () => {
        if (fOublier) fOublier();
        if (fOublierÉcrire) fOublierÉcrire();
        if (fOublierPermission) fOublierPermission();
      });
      step("On détecte l'ajout d'une permission membre", async () => {
        await client.donnerAccès(idBd, client2.idBdRacine!, MEMBRE);
        await attendreRésultat(résultatPermission, "permission", MEMBRE);

        const infoInvité = lAccès.find(
          (a) => a.idBdRacine === client2.idBdRacine
        );
        expect(infoInvité?.rôle).to.equal(MEMBRE);
      });

      step("L'invité détecte l'ajout de sa permission membre", async () => {
        expect(permissionÉcrire).to.be.true;
        expect(résultatPermission["permission"]).to.equal(MEMBRE);
      });

      step("On détecte l'ajout d'une permission modératrice", async () => {
        await client.donnerAccès(idBd, client2.idBdRacine!, MODÉRATEUR);
        await attendreRésultat(résultatPermission, "permission", MODÉRATEUR);

        const infoInvité = lAccès.find(
          (a) => a.idBdRacine === client2.idBdRacine
        );
        expect(infoInvité?.rôle).to.equal(MODÉRATEUR);
      });

      step(
        "L'invité détecte l'ajout de sa permission modératrice",
        async () => {
          expect(permissionÉcrire).to.be.true;
          expect(résultatPermission["permission"]).to.equal(MODÉRATEUR);
        }
      );
    });

    describe("Épingler BD", function () {
      let idBdKv: string;
      let bdKv: KeyValueStore;

      let idBdListe: string;
      let bdListe: FeedStore;

      let idBdKv2: string;

      let cidTexte: string;

      before(async () => {
        idBdKv = await client.créerBdIndépendante("kvstore");
        bdKv = await client.ouvrirBd(idBdKv);

        idBdListe = await client.créerBdIndépendante("feed");
        bdListe = await client.ouvrirBd(idBdListe);

        idBdKv2 = await client.créerBdIndépendante("kvstore");

        await bdKv.put("ma bd liste", idBdListe);
        await bdListe.add(idBdKv2);

        cidTexte = (await client2.sfip!.add("Bonjour !")).cid.toString(); // Utiliser ipfs2 pour ne pas l'ajouter à ipfs1 directement (simuler adition d'un autre membre)
        await bdListe.add(cidTexte);

        await client.épinglerBd(idBdKv);
      });
      after(async () => {
        if (bdKv) fermerBd(bdKv);
        if (bdListe) fermerBd(bdListe);
      });

      step("La BD est épinglée", async () => {
        expect(client._bds[idBdKv]).to.exist;
      });
      step("Récursion KVStore", async () => {
        expect(client._bds[idBdListe]).to.exist;
      });
      step("Récursion FeedStore", async () => {
        expect(client._bds[idBdKv2]).to.exist;
      });
      step("Les fichiers SFIP sont également épinglés", async () => {
        let fichierEstÉpinglé = false;
        await new Promise<void>((résoudre) => {
          const interval = setInterval(async () => {
            const épinglés = await all(client.sfip!.pin.ls());
            fichierEstÉpinglé = épinglés
              .map((x) => x.cid.toString())
              .includes(cidTexte);
            if (fichierEstÉpinglé) {
              clearInterval(interval);
              résoudre();
            }
          }, 50);
        });

        expect(fichierEstÉpinglé).to.be.true;
      });
    });
  });
});

if (LOG) {
  setTimeout(function () {
    log(); // logs out active handles that are keeping node running
  }, 10000);
}
