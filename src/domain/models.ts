export type Note = "top" | "heart" | "base";

export type Material = {
  id: string;
  cn: string;
  en: string;
  note: Note;
  diluted: boolean;
  solvent: string;
  concentration: string;
  materialType?: "synthetic" | "natural" | "accord";
  vaporPressure?: string;
  /** Legacy fields kept only so older saved records can be cleaned on their next save. */
  latinName?: string;
  cas?: string;
  supplier?: string;
  referenceUrl?: string;
  groupId?: string;
  tagIds?: string[];
  createdAt?: string;
};

export type Ingredient = {
  id: string;
  name: string;
  materialId?: string;
  ratio: number;
  amount: number;
};

export type Evaluation = {
  testedAt: string;
  restDays: number;
  projection: number;
  sillage: number;
  longevity: number;
  opening: string;
  heart: string;
  drydown: string;
  nextStep: string;
};

export type Formula = {
  id: string;
  name: string;
  version: string;
  created: string;
  measure: "mass" | "volume";
  concentration: number;
  fragrance: number;
  solvent: number;
  solventType: string;
  use: "香水" | "香薰" | "香基";
  notes: string;
  evaluation?: Evaluation;
  adjustmentStep?: number;
  groupId?: string;
  tagIds?: string[];
  ingredients: Record<Note, Ingredient[]>;
};

export type Group = {
  id: string;
  name: string;
  kind: "formula" | "material";
};

export type VaporSource = { id: string; name: string; url: string };
export type VaporSettings = { id: "vapor_lookup"; sources: VaporSource[]; broadSearch: boolean };
export type GuestStore = { formulas: Formula[]; materials: Material[]; groups: Group[]; settings: VaporSettings[] };

