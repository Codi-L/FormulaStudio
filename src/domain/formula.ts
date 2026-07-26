import type { Evaluation, Formula, Note } from "./models";

export const noteMeta: Record<Note, { label: string; sub: string }> = {
  top: { label: "前调", sub: "TOP NOTES" },
  heart: { label: "中调", sub: "HEART NOTES" },
  base: { label: "后调", sub: "BASE NOTES" },
};

export const uid = () => crypto.randomUUID();
export const today = () => new Date().toISOString().slice(0, 10);

export const tagIdsFor = (record: { groupId?: string; tagIds?: string[] }) =>
  record.tagIds ?? (record.groupId ? [record.groupId] : []);

const versionParts = (version: string) =>
  version.split(".").map(value => Number.parseInt(value, 10) || 0).slice(0, 3).concat([0, 0, 0]).slice(0, 3);

export const compareVersions = (a: string, b: string) => {
  const av = versionParts(a);
  const bv = versionParts(b);
  for (let i = 0; i < 3; i += 1) if (av[i] !== bv[i]) return av[i] - bv[i];
  return 0;
};

export const nextVersion = (version: string) => {
  const [major, minor, patch] = versionParts(version);
  return `${major}.${minor}.${patch + 1}`;
};

export const emptyEvaluation = (): Evaluation => ({
  testedAt: today(), restDays: 0, projection: 3, sillage: 3, longevity: 0,
  opening: "", heart: "", drydown: "", nextStep: "",
});

export const emptyFormula = (): Formula => ({
  id: uid(), name: "未命名配方", version: "1.0.0", created: today(), measure: "mass",
  concentration: 20, fragrance: 10, solvent: 40, solventType: "无水乙醇", use: "香水",
  notes: "", evaluation: emptyEvaluation(), ingredients: { top: [], heart: [], base: [] },
});

