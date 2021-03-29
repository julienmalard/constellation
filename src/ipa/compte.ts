import ClientConstellation, { schémaFonctionSuivi } from "./client";

const MAX_TAILLE_IMAGE = 500;

const schémaClient = {
  noms: "kvstore",
  courriel: null,
  image: null
};

export default class Compte {
  client: ClientConstellation;
  idBD: string;

  constructor(client: ClientConstellation, id: string) {
    this.client = client;
    this.idBD = id;
  }

  async suivreCourriel(f: schémaFonctionSuivi) {
    return this.client.suivreBD(this.idBD, async bd => {
      const courriel = await bd.get("courriel");
      f(courriel);
    });
  }

  async sauvegarderCourriel(courriel: string) {
    const bd = await this.client.ouvrirBD(this.idBD);
    await bd.set("courriel", courriel);
  }

  async suivreNoms(f: schémaFonctionSuivi) {
    const idBDNoms = await this.client.obtIdBd("noms", this.idBD);
    return this.client.suivreBD(idBDNoms, async bd => {
      let noms = bd.all;
      noms = Object.fromEntries(
        Object.keys(noms).map(x => {
          return [x, noms[x]];
        })
      );
      f(noms);
    });
  }

  async sauvegarderNom(langue: string, nom: string) {
    const idBDNoms = await this.client.créerBD("noms", this.idBD, "kvstore");
    const bd = await this.client.ouvrirBD(idBDNoms);
    await bd.set(langue, nom);
  }

  async effacerNom(langue: string) {
    const idBDNoms = await this.client.obtIdBd("noms", this.idBD);
    const bd = await this.client.ouvrirBD(idBDNoms);
    await bd.del(langue);
  }

  async sauvegarderImage(image: File) {
    const bits = await image.arrayBuffer();
    const idImage = await this.client.ajouterÀSFIP(bits);
    const bd = await this.client.ouvrirBD(this.idBD);
    await bd.set("image", idImage);
  }

  async effacerImage() {
    const bd = await this.client.ouvrirBD(this.idBD);
    const idImage = await bd.get("image");
    await this.client.effacerDeSFIP(idImage);
    await bd.del("image");
  }

  async suivreImage(f: schémaFonctionSuivi) {
    return this.client.suivreBD(this.idBD, async bd => {
      const idImage = await bd.get("image");
      if (!idImage) return f(null);
      const image = await this.client.obtFichierSFIP(idImage, MAX_TAILLE_IMAGE);
      f(image);
    });
  }
}
