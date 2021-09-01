import { expect } from "chai";
import { v4 as uuidv4 } from "uuid";
import { élémentsBd } from "@/ipa/client"
import { validerCatégorieVal, générerFonctionRègle, règleColonne, règleBornes, règleCatégorie, règleValeurCatégorique, typeOp } from "@/ipa/valid";
import { catégorieVariables } from "@/ipa/variables";

const catégories: {[key in catégorieVariables]: {valides: élémentsBd[], invalides: élémentsBd[]}} = {
  numérique: {
    valides: [-12.3, 0, 1, 123e5],
    invalides: [null, "abc", {"a": 2}]
  },
  chaîne: {
    valides: ["abc", "வணக்கம்", ""],
    invalides: [123, null, ["abc"]]
  },
  date: {
    valides: [],
    invalides: []
  },
  heure: {
    valides: [],
    invalides: []
  },
  dateEtHeure: {
    valides: [Date.now()],
    invalides: []
  },
  catégorique: {
    valides: [],
    invalides: []
  },
  booléen: {
    valides: [true, false],
    invalides: [1, 0, null]
  },
  géojson: {
    valides: [],
    invalides: []
  },
  fichier: {
    valides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".பை" }
    ],
    invalides: [
      { cid: "Je ne suis pas un cid", ext: ".பை" },
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP" },
      { ext: ".பை" }
    ]
  },
  vidéo: {
    valides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".mp4" }
    ],
    invalides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".jpg" }
    ]
  },
  audio: {
    valides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".mp3" }
    ],
    invalides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".ts" }
    ]
  },
  photo: {
    valides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".jpg" }
    ],
    invalides: [
      { cid: "QmRZycUKy3MnRKRxkLu8jTzBEVHZovsYcbhdiwLQ221eBP", ext: ".பை" }
    ]
  }
}


describe("Validation", function () {
  describe("Valider catégories", function () {
    Object.keys(catégories).forEach((cat: catégorieVariables) => {
      describe(cat + " valides", function() {
        catégories[cat].valides.forEach(val=> {
          it(`${val}`, () => {
            const valide = validerCatégorieVal(val, cat);
            expect(valide).to.be.true
          })
        })
      });
      describe(cat + " non valides", function() {
        catégories[cat].invalides.forEach(val=> {
          it(`${val}`, () => {
            const valide = validerCatégorieVal(val, cat);
            expect(valide).to.be.false
          })
        })
      })
    })
  });
  describe("Générer fonction règle", function() {
    describe("Règles catégories", function() {
      const règle: règleColonne<règleCatégorie> = {
        source: "variable",
        colonne: "col numérique",
        règle: {
          id: uuidv4(),
          règle: {
            typeRègle: "catégorie",
            détails: {
              catégorie: "numérique"
            }
          }
        }
      }
      const fonc = générerFonctionRègle(règle, {})
      const empreinte = uuidv4();

      it("Catérogie valide", () => {
        const erreurs = fonc([
          {
            données: {"col numérique": 123},
            empreinte
          }
        ])
        expect(erreurs).to.be.an.empty("array")
      });
      it("Catérogie invalide", () => {
        const erreurs = fonc([
          {
            données: {"col numérique": "abc"},
            empreinte
          }
        ])
        expect(erreurs).to.be.an("array").with.lengthOf(1);
        expect(erreurs[0].empreinte).to.equal(empreinte)
        expect(erreurs[0].erreur.règle).to.deep.equal(règle);
      })
    });
    describe("Règles bornes", function() {

      it("Pas d'erreure si la colonne n'existe pas", () => {
        const règle: règleColonne<règleBornes> = {
          source: "tableau",
          colonne: "col numérique",
          règle: {
            id: uuidv4(),
            règle: {
              typeRègle: "bornes",
              détails: {
                val: 0,
                op: ">="
              }
            }
          }
        }
        const fonc = générerFonctionRègle(règle, {});
        const erreurs = fonc([{données: {"une autre colonne": 1}, empreinte: uuidv4()}])
        expect(erreurs).to.be.an.empty("array")
      })

      const ref = 0;
      const ops: {op: typeOp, valides: number[], invalides: number[]}[] = [
        {op: ">", valides: [0.1, 1], invalides: [0, -1]},
        {op: ">=", valides: [0, 1], invalides: [-0.1, -1]},
        {op: "<", valides: [-1, -0.1], invalides: [0, 1]},
        {op: "<=", valides: [-1, 0], invalides: [0.1, 1]},
      ];
      ops.forEach(op=>{
        describe(op.op, ()=>{
          const règle: règleColonne<règleBornes> = {
            source: "variable",
            colonne: "col numérique",
            règle: {
              id: uuidv4(),
              règle: {
                typeRègle: "bornes",
                détails: {
                  val: ref,
                  op: op.op
                }
              }
            }
          }
          const fonc = générerFonctionRègle(règle, {})
          const empreinte = uuidv4();

          op.valides.forEach(v=>{
            it(`${v}`, () => {
              const erreurs = fonc([
                {
                  données: {"col numérique": v},
                  empreinte
                }
              ])
              expect(erreurs).to.be.an.empty("array")
            })
          })
          op.invalides.forEach(v=>{
            it(`${v}`, () => {
              const erreurs = fonc([
                {
                  données: {"col numérique": v},
                  empreinte
                }
              ])
              expect(erreurs).to.be.an("array").with.lengthOf(1);
              expect(erreurs[0].empreinte).to.equal(empreinte)
              expect(erreurs[0].erreur.règle).to.deep.equal(règle);
            })
          })
        });
      });

      describe("Bornes selon une autre variable", () => {
        const règle: règleColonne<règleBornes> = {
          source: "tableau",
          colonne: "temp max",
          règle: {
            id: uuidv4(),
            règle: {
              typeRègle: "bornes",
              détails: {
                val: "var temp min",
                op: ">="
              }
            }
          }
        }
        const fonc = générerFonctionRègle(règle, {"var temp min": "temp min"})
        const empreinte = uuidv4();
        it("Pas d'erreur si la colonne n'existe pas", () => {
          const erreurs = fonc([{données: {"temp min": 1}, empreinte}])
          expect(erreurs).to.be.an.empty("array")
        })
        it("Pas d'erreur si tout est valide", () => {
          const erreurs = fonc([{données: {"temp min": 10, "temp max": 20}, empreinte}])
          expect(erreurs).to.be.an.empty("array")
        })
        it("Pas d'erreur si la colonne référence n'existe pas", () => {
          const erreurs = fonc([{données: {"temp max": 20}, empreinte}])
          expect(erreurs).to.be.an.empty("array")
        })
        it("Erreur si non valide", () => {
          const erreurs = fonc([{données: {"temp max": 20, "temp min": 25}, empreinte}])

          expect(erreurs).to.be.an("array").with.lengthOf(1);
          expect(erreurs[0].empreinte).to.equal(empreinte)
          expect(erreurs[0].erreur.règle).to.deep.equal(règle);
        })
      })
    });
    describe("Règles catégoriques", function() {
      const règle: règleColonne<règleValeurCatégorique> = {
        source: "tableau",
        colonne: "col chaîne",
        règle: {
          id: uuidv4(),
          règle: {
            typeRègle: "valeurCatégorique",
            détails: {
              options: ["a", "b", "c"]
            }
          }
        }
      }
      const fonc = générerFonctionRègle(règle, {"var temp min": "temp min"})
      const empreinte = uuidv4();

      it("Pas d'erreur si la colonne n'existe pas", () => {
        const erreurs = fonc([{données: {"une autre colonne": 2}, empreinte}])
        expect(erreurs).to.be.an.empty("array")
      })
      it("Pas d'erreur si tout valide", () => {
        const erreurs = fonc([{données: {"col chaîne": "a"}, empreinte}])
        expect(erreurs).to.be.an.empty("array")
      })
      it("Erreur si non valide", () => {
        const erreurs = fonc([{données: {"col chaîne": "d"}, empreinte}])

        expect(erreurs).to.be.an("array").with.lengthOf(1);
        expect(erreurs[0].empreinte).to.equal(empreinte)
        expect(erreurs[0].erreur.règle).to.deep.equal(règle);
      })
    })
  })
});
