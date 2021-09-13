import log from "why-is-node-running";
import { expect } from "chai";
import { step } from "mocha-steps";

import fs from "fs";
import path from "path";

import { enregistrerContrôleurs } from "@/ipa/accès";
import ClientConstellation, {
  schémaFonctionSuivi,
  schémaFonctionOublier,
  uneFois,
} from "@/ipa/client";
import {
  infoMembreEnLigne,
  infoRéplication,
  schémaBd,
  élémentDeMembre,
} from "@/ipa/reseau";
import { élémentBdListeDonnées } from "@/ipa/valid";

import { testAPIs, config } from "./sfipTest";
import { attendreRésultat, générerClients } from "./utils";

const LOG = false;

Object.keys(testAPIs).forEach((API) => {
  describe("Réseau", function () {
    this.timeout(config.timeout);

    let fOublierClients: () => Promise<void>;
    let clients: ClientConstellation[];
    let client: ClientConstellation, client2: ClientConstellation;

    before(async () => {
      ({ fOublier: fOublierClients, clients } = await générerClients(2, API));
      [client, client2] = clients;

      enregistrerContrôleurs();
    });

    after(async () => {
      if (fOublierClients) await fOublierClients();
    });

    describe("Suivre membres", function () {
      const rés: { ultat: infoMembreEnLigne[] | undefined } = {
        ultat: undefined,
      };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        fOublier = await client.réseau!.suivreMembres((c) => (rés.ultat = c));
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Autres membres détectés", async () => {
        expect(rés.ultat).to.be.an("array").with.lengthOf(2);
        expect(rés.ultat!.map((r) => r.idBdRacine)).to.include.members([
          client.idBdRacine,
          client2.idBdRacine,
        ]);
      });
    });

    describe("Suivre postes", function () {
      const rés: { ultat: { addr: string; peer: string }[] | undefined } = {
        ultat: undefined,
      };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        fOublier = await client.réseau!.suivreConnexionsPostes(
          (c) => (rés.ultat = c)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Autres postes détectés", async () => {
        expect(rés.ultat!.map((r) => r.peer)).to.include.members([
          client2.idNodeSFIP!.id,
        ]);
      });
    });

    describe("Suivre noms membre", function () {
      const rés: { ultat: { [key: string]: string } | undefined } = {
        ultat: undefined,
      };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        await client.compte!.sauvegarderNom("fr", "Julien");
        fOublier = await client2.réseau!.suivreNomsMembre(
          client.idBdRacine!,
          (n) => (rés.ultat = n)
        );
      });

      step("Noms détectés", async () => {
        await attendreRésultat(
          rés,
          "ultat",
          (x: { [key: string]: string }) => x.fr
        );
        expect(rés.ultat?.fr).to.exist;
        expect(rés.ultat?.fr).to.equal("Julien");
      });

      after(async () => {
        if (fOublier) fOublier();
      });
    });

    describe("Suivre courriel membre", function () {
      const rés: { ultat: string | null | undefined } = { ultat: undefined };
      let fOublier: schémaFonctionOublier;

      before(async () => {
        await client.compte!.sauvegarderCourriel("தொடர்பு@லஸ்ஸி.இந்தியா");
        fOublier = await client2.réseau!.suivreCourrielMembre(
          client.idBdRacine!,
          (c) => (rés.ultat = c)
        );
      });

      step("Courriel détecté", async () => {
        await attendreRésultat(rés, "ultat", (x: string | null | undefined) =>
          Boolean(x)
        );
        expect(rés.ultat).to.equal("தொடர்பு@லஸ்ஸி.இந்தியா");
      });

      after(async () => {
        if (fOublier) fOublier();
      });
    });

    describe("Suivre image membre", function () {
      const rés: { ultat: Uint8Array | undefined | null } = {
        ultat: undefined,
      };
      let fOublier: schémaFonctionOublier;

      const OCTETS = fs.readFileSync(
        path.resolve(__dirname, "../../src/assets/logo.svg")
      );
      const IMAGE: File = {
        name: "logo.png",
        path: "../../assets/logo.png",
        arrayBuffer: () => Promise.resolve(OCTETS),
        lastModified: Date.now(),
        size: 100,
        stream: () => new ReadableStream(),
        type: "image/png",
        text: () => Promise.resolve(""),
        slice: () => new Blob(),
      };

      before(async () => {
        await client.compte!.sauvegarderImage(IMAGE);
        fOublier = await client2.réseau!.suivreImageMembre(
          client.idBdRacine!,
          (i) => (rés.ultat = i)
        );
      });

      after(async () => {
        if (fOublier) fOublier();
      });

      step("Image détectée", async () => {
        await attendreRésultat(
          rés,
          "ultat",
          (x: Uint8Array | undefined | null) => Boolean(x)
        );
        expect(rés.ultat).to.deep.equal(new Uint8Array(OCTETS));
      });
    });

    describe("Suivre BDs", function () {
      let idBd: string;
      let idBd2: string;

      const rés: { ultat?: string[]; ultat_2?: string[] } = {
        ultat: undefined,
        ultat_2: undefined,
      };
      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        fsOublier.push(
          await client2.réseau!.suivreBdsMembre(
            client.idBdRacine!,
            (bds) => (rés.ultat = bds)
          )
        );
        fsOublier.push(
          await client2.réseau!.suivreBds((bds) => (rés.ultat_2 = bds))
        );

        idBd = await client.bds!.créerBd("ODbl-1_0");
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      step("BD d'un autre membre détectée", async () => {
        await attendreRésultat(rés, "ultat", (x?: string[]) => x && x.length);
        expect(rés.ultat)
          .to.be.an("array")
          .with.lengthOf(1)
          .and.members([idBd]);
      });

      step("BDs du réseau détectées", async () => {
        idBd2 = await client2.bds!.créerBd("ODbl-1_0");
        await attendreRésultat(
          rés,
          "ultat_2",
          (x?: string[]) => x && x.length === 2
        );
        expect(rés.ultat_2)
          .to.be.an("array")
          .with.lengthOf(2)
          .and.members([idBd, idBd2]);
      });
    });

    describe("Suivre réplications", function () {
      let idBd: string;

      const rés: { ultat?: infoRéplication[] } = {
        ultat: undefined,
      };
      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        idBd = await client.bds!.créerBd("ODbl-1_0");
        fsOublier.push(
          await client.réseau!.suivreRéplications(
            idBd,
            (bds) => (rés.ultat = bds)
          )
        );
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      step("Auteur de la BD pour commencer", async () => {
        await client.favoris!.épinglerFavori(idBd);
        await attendreRésultat(
          rés,
          "ultat",
          (x?: infoRéplication[]) => x && x.length
        );
        expect(rés.ultat).to.be.an("array").with.lengthOf(1);
        expect(rés.ultat!.map((r) => r.idOrbite)).to.have.members([
          client.orbite!.identity.id,
        ]);
      });

      step("Ajout d'une réplication détectée", async () => {
        await client2.favoris!.épinglerFavori(idBd);

        await attendreRésultat(
          rés,
          "ultat",
          (x?: infoRéplication[]) => x && x.length === 2
        );
        expect(rés.ultat).to.be.an("array").with.lengthOf(2);
        expect(rés.ultat!.map((r) => r.idOrbite)).to.have.members([
          client.orbite!.identity.id,
          client2.orbite!.identity.id,
        ]);
      });
    });

    describe("Suivre BD par mot-clef unique", function () {
      let motClef: string;
      let idBd1: string;
      let idBd2: string;
      let idTableau1: string | undefined;
      let idTableau2: string | undefined;

      let empreinte1: string;
      let empreinte2: string;
      let empreinte3: string;

      const idUniqueTableau = "tableau trads";
      const données1 = { clef: "titre", langue: "fr", trad: "Constellation" };
      const données2 = { clef: "titre", langue: "हिं", trad: "तारामंडल" };
      const données3 = { clef: "titre", langue: "kaq", trad: "Ch'umil" };

      const rés: {
        ultat?: string[];
        ultat2?: élémentDeMembre<élémentBdListeDonnées>[];
      } = { ultat: undefined, ultat2: undefined };
      const fsOublier: schémaFonctionOublier[] = [];

      before(async () => {
        const idVarClef = await client.variables!.créerVariable("chaîne");
        const idVarLangue = await client.variables!.créerVariable("chaîne");
        const idVarTrad = await client.variables!.créerVariable("chaîne");

        motClef = await client.motsClefs!.créerMotClef();

        const schéma: schémaBd = {
          licence: "ODbl-1_0",
          motsClefs: [motClef],
          tableaux: [
            {
              cols: [
                {
                  idVariable: idVarClef,
                  idColonne: "clef",
                },
                {
                  idVariable: idVarLangue,
                  idColonne: "langue",
                },
                {
                  idVariable: idVarTrad,
                  idColonne: "trad",
                },
              ],
              idUnique: idUniqueTableau,
            },
          ],
        };

        idBd1 = await client.bds!.créerBdDeSchéma(schéma);
        idBd2 = await client2.bds!.créerBdDeSchéma(schéma);

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
              return await client2.bds!.suivreTableauxBd(idBd2, fSuivi);
            }
          )
        )[0];

        fsOublier.push(
          await client.réseau!.suivreBdsDeMotClefUnique(
            motClef,
            (bds) => (rés.ultat = bds)
          )
        );
        fsOublier.push(
          await client.réseau!.suivreÉlémentsDeTableauxUniques(
            motClef,
            idUniqueTableau,
            (éléments) => (rés.ultat2 = éléments)
          )
        );

        empreinte1 = await client.tableaux!.ajouterÉlément(
          idTableau1,
          données1
        );
        empreinte2 = await client.tableaux!.ajouterÉlément(
          idTableau1,
          données2
        );
        empreinte3 = await client2.tableaux!.ajouterÉlément(
          idTableau2,
          données3
        );
      });

      after(async () => {
        fsOublier.forEach((f) => f());
      });

      step("Suivre BDs du réseau", async () => {
        await attendreRésultat(
          rés,
          "ultat",
          (x?: string[]) => x && x.length === 2
        );
        expect(rés.ultat)
          .to.be.an("array")
          .with.lengthOf(2)
          .and.members([idBd1, idBd2]);
      });
      step("Suivre éléments des BDs", async () => {
        await attendreRésultat(
          rés,
          "ultat2",
          (x?: string[]) => x && x.length === 3
        );
        expect(
          rés.ultat2!.map((r) => {
            delete r.élément.données["id"];
            return r;
          })
        )
          .to.be.an("array")
          .with.lengthOf(3)
          .and.deep.members([
            {
              idBdAuteur: client.idBdRacine,
              élément: {
                empreinte: empreinte1,
                données: données1,
              },
            },
            {
              idBdAuteur: client.idBdRacine,
              élément: {
                empreinte: empreinte2,
                données: données2,
              },
            },
            {
              idBdAuteur: client2.idBdRacine,
              élément: {
                empreinte: empreinte3,
                données: données3,
              },
            },
          ]);
      });
    });
  });
});

if (LOG)
  setTimeout(function () {
    log(); // logs out active handles that are keeping node running
  }, 10000);
