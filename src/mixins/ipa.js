export default {
  data: function () {
    return {
      crochets: [],
      crochetIPA: null,
    };
  },
  methods: {
    suivre(crochet) {
      if (!Array.isArray(crochet)) {
        crochet = [crochet];
      }
      this.crochets = [...crochet, ...this.crochets];
    },
    oublierCrochets() {
      this.crochets.forEach((c) => c());
      this.crochets = []
    },
    async réInitialiserSuivi() {
      this.oublierCrochets();
      await this.initialiserSuivi();
    }
  },
  mounted: function () {
    this.crochetIPA = this.initialiserSuivi.bind(this);
    this.$ipa.setMaxListeners(0);
    this.$ipa.on("pret", this.crochetIPA);
    if (this.$ipa.pret) {
      this.initialiserSuivi();
    }
  },
  unMounted: function () {
    this.$ipa.off("pret", this.crochetIPA);
    this.oublierCrochets();
  },
};
