import { today } from "./formula";
import type { Formula, Material, VaporSettings } from "./models";

export const defaultVaporSettings: VaporSettings = {
  id: "vapor_lookup",
  sources: [
    { id: "zoteq", name: "Zoteq", url: "https://www.zoteq.com/" },
    { id: "chembk", name: "ChemBK", url: "https://www.chembk.com/" },
    { id: "chemicalbook", name: "ChemicalBook", url: "https://www.chemicalbook.com/" },
  ],
  broadSearch: false,
};

export const demoMaterials: Material[] = [
  { id: "m1", cn: "佛手柑", en: "Bergamot", note: "top", diluted: false, solvent: "", concentration: "" },
  { id: "m2", cn: "玫瑰原精", en: "Rose Absolute", note: "heart", diluted: true, solvent: "无水乙醇", concentration: "10" },
  { id: "m3", cn: "檀香", en: "Sandalwood", note: "base", diluted: false, solvent: "", concentration: "" },
];

export const demoFormula: Formula = {
  id: "f1", name: "雨后白茶", version: "2.1.0", created: today(), measure: "mass",
  concentration: 20, fragrance: 10, solvent: 40, solventType: "无水乙醇", use: "香水",
  notes: "比上一版减少了木质基调，开场更清透。静置两周后再评估扩散。",
  ingredients: {
    top: [{ id: "i1", name: "佛手柑", materialId: "m1", ratio: 2, amount: 120 }],
    heart: [{ id: "i2", name: "玫瑰原精", materialId: "m2", ratio: 1, amount: 60 }],
    base: [{ id: "i3", name: "檀香", materialId: "m3", ratio: 2, amount: 120 }],
  },
};

