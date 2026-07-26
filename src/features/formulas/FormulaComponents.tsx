import { useEffect, useRef, useState } from "react";
import type { Formula, Group, Ingredient, Material, Note } from "../../domain/models";
import { compareVersions, nextVersion, noteMeta, tagIdsFor, uid } from "../../domain/formula";
import { Field, NumericInput, UnitInput } from "../../components/common/FormControls";
import { GroupBar, TagDisplay, TagPicker } from "../../components/tags/TagControls";

export function FormulaReader({ formula, materials, groups, onEdit, onBlend, onCopy, onDelete, copyStatus }: {
    formula: Formula;
    materials: Material[];
    groups: Group[];
    onEdit: () => void;
    onBlend: () => void;
    onCopy: () => void;
    onDelete: () => void;
    copyStatus: string;
}) {
    const all = Object.values(formula.ingredients).flat();
    const materialFor = (row: Ingredient) => materials.find(m => m.id === row.materialId) || materials.find(m => m.cn === row.name || m.en === row.name);
    const ratioTotal = all.reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
    const evaluation = formula.evaluation;
    const hasEvaluation = evaluation && (evaluation.opening || evaluation.heart || evaluation.drydown || evaluation.nextStep || evaluation.longevity || evaluation.restDays);
    const visibleNotes = (["top", "heart", "base"] as Note[]).filter(note => formula.ingredients[note].length > 0);
    return <article className="formulaReader">
      <section className="readerHero">
        <div><span className="eyebrow">{formula.use}配方 · VERSION {formula.version}</span><h1>{formula.name}</h1><p>{formula.created} 创建 · {formula.measure === "mass" ? "质量配方" : "体积配方"}</p><TagDisplay groups={groups} selected={tagIdsFor(formula)}/></div>
        <div className="readerActions"><button onClick={onCopy}>复制 Markdown</button><button className="readerDelete" onClick={onDelete}>删除</button><button className="blendButton" onClick={onBlend}>开始调配</button><button className="primary" onClick={onEdit}>编辑配方</button>{copyStatus && <small>{copyStatus}</small>}</div>
      </section>
      <section className="readerSummary">
        <div><span>香料浓度</span><b>{Number(formula.concentration).toFixed(2)}%</b></div>
        <div><span>原料种数</span><b>{all.length}</b></div>
        <div><span>溶剂种类</span><b>{formula.solventType}</b></div>
        <div><span>比例合计</span><b>{ratioTotal.toFixed(2)}%</b></div>
      </section>
      <section className="readerComposition">
        <div className="readerSectionTitle"><span>01</span><div><small>FORMULA COMPOSITION</small><h2>香料构成</h2></div></div>
        <div className={`readerNotesGrid noteCount-${visibleNotes.length}`}>{visibleNotes.map(note => {
            const rows = formula.ingredients[note];
            const subtotal = rows.reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
            return <section className={`readerNote readerNote-${note}`} key={note}>
              <header><div><i/><b>{noteMeta[note].label}</b><small>{noteMeta[note].sub}</small></div><span>{subtotal.toFixed(2)}%</span></header>
              <div className="readerTable"><div className="readerRow readerTh"><span>原料</span><span>比例</span></div>{rows.map(row => {
                  const material = materialFor(row);
                  return <div className="readerRow" key={row.id}><span className="readerMaterial"><b>{material?.cn || row.name || "未命名原料"}</b>{material?.en && <small>{material.en}</small>}{material?.diluted && <em>{material.concentration}% · {material.solvent}</em>}</span><span>{Number(row.ratio).toFixed(2)}%</span></div>;
              })}</div>
            </section>;
        })}{visibleNotes.length === 0 && <p className="readerEmptyComposition">该配方尚未添加香料。</p>}</div>
      </section>
      {hasEvaluation && <section className="readerEvaluation"><div className="readerSectionTitle"><span>02</span><div><small>WEARING NOTES</small><h2>试香评估</h2></div></div><div className="readerScores"><div><span>试香日期</span><b>{evaluation.testedAt || "未记录"}</b></div><div><span>静置</span><b>{evaluation.restDays || 0} 天</b></div><div><span>扩散力</span><b>{evaluation.projection}/5</b></div><div><span>香迹</span><b>{evaluation.sillage}/5</b></div><div><span>留香</span><b>{evaluation.longevity || 0} 小时</b></div></div><div className="readerJournal">{evaluation.opening && <div><span>0—30 MIN</span><h3>开场</h3><p>{evaluation.opening}</p></div>}{evaluation.heart && <div><span>1—4 HOURS</span><h3>中段</h3><p>{evaluation.heart}</p></div>}{evaluation.drydown && <div><span>4+ HOURS</span><h3>尾调</h3><p>{evaluation.drydown}</p></div>}{evaluation.nextStep && <div className="readerNext"><span>NEXT VERSION</span><h3>下一版本修改方向</h3><p>{evaluation.nextStep}</p></div>}</div></section>}
      {formula.notes && <section className="readerNotes"><div className="readerSectionTitle"><span>{hasEvaluation ? "03" : "02"}</span><div><small>FORMULATOR'S NOTE</small><h2>调香备注</h2></div></div><p>{formula.notes}</p></section>}
    </article>;
}

type BlendRow = { id: string; note: Note; name: string; ratio: number; amount: number };
type BlendDraft = { fragrance: number; solvent: number; concentration: number; rows: BlendRow[] };
export function BlendModal({ formula, materials, onClose, onSave }: {
    formula: Formula;
    materials: Material[];
    onClose: () => void;
    onSave: (mode: "overwrite" | "version", formula: Formula) => Promise<void>;
}) {
    const ratioTotal = Object.values(formula.ingredients).flat().reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
    const initialFragrance = Number(formula.fragrance) || Object.values(formula.ingredients).flat().reduce((sum, row) => sum + (Number(row.amount) || 0), 0) / 1000;
    const makeDraft = (): BlendDraft => ({ fragrance: initialFragrance, solvent: Number(formula.solvent) || 0, concentration: Number(formula.concentration) || 0, rows: (Object.keys(formula.ingredients) as Note[]).flatMap(note => formula.ingredients[note].map(row => ({ id: row.id, note, name: row.name, ratio: Number(row.ratio) || 0, amount: Number(row.amount) > 0 ? Number(row.amount) / 1000 : (ratioTotal > 0 ? initialFragrance * (Number(row.ratio) || 0) / ratioTotal : 0) }))) });
    const [draft, setDraft] = useState<BlendDraft>(makeDraft);
    const [source, setSource] = useState<"fragrance" | "solvent">("fragrance");
    const [lastChanged, setLastChanged] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const undoStack = useRef<BlendDraft[]>([]);
    const redoStack = useRef<BlendDraft[]>([]);
    const [, rerender] = useState(0);
    const commit = (next: BlendDraft) => { undoStack.current.push(structuredClone(draft)); redoStack.current = []; setDraft(next); rerender(value => value + 1); };
    const undoBlend = () => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(structuredClone(draft)); setDraft(previous); rerender(value => value + 1); };
    const redoBlend = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(structuredClone(draft)); setDraft(next); rerender(value => value + 1); };
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redoBlend() : undoBlend(); }
            if (event.key.toLowerCase() === "y") { event.preventDefault(); redoBlend(); }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    });
    const rowSum = draft.rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    const materialForBlendRow = (row: BlendRow) => {
        const ingredient = formula.ingredients[row.note].find(item => item.id === row.id);
        return materials.find(item => item.id === ingredient?.materialId) || materials.find(item => item.cn === row.name || item.en === row.name);
    };
    const dilutionForRow = (row: BlendRow) => {
        const material = materialForBlendRow(row);
        if (!material?.diluted) return { material, solvent: 0, concentration: 100 };
        const concentration = Math.max(0, Math.min(100, Number(material.concentration) || 0));
        return { material, concentration, solvent: Math.max(0, row.amount) * (1 - concentration / 100) };
    };
    const dilutedSolvent = draft.rows.reduce((sum, row) => sum + dilutionForRow(row).solvent, 0);
    const netSolvent = draft.solvent - dilutedSolvent;
    const solventDeficit = netSolvent < -.0000001;
    const actualRatios = draft.rows.map(row => rowSum > 0 ? row.amount / rowSum * 100 : 0);
    const needsRepair = Math.abs(rowSum - draft.fragrance) > .0005 || draft.rows.some((row, index) => Math.abs(actualRatios[index] - (ratioTotal ? row.ratio / ratioTotal * 100 : 0)) > .02);
    const complete = () => {
        const concentration = Math.max(0, Math.min(100, draft.concentration));
        const fragrance = source === "solvent" && concentration > 0 && concentration < 100 ? draft.solvent * concentration / (100 - concentration) : draft.fragrance;
        const solvent = source === "fragrance" && concentration > 0 ? fragrance * (100 - concentration) / concentration : draft.solvent;
        const rows = draft.rows.map(row => ({ ...row, amount: ratioTotal > 0 ? fragrance * row.ratio / ratioTotal : 0 }));
        commit({ ...draft, fragrance: +fragrance.toFixed(6), solvent: +solvent.toFixed(6), rows });
    };
    const normalizeRows = (rows: BlendRow[], total: number) => rows.map(row => ({ ...row, ratio: total > 0 ? +(row.amount / total * 100).toFixed(4) : 0 }));
    const spreadToTotal = (rows: BlendRow[], target: number, lockedId: string | null) => {
        const next = rows.map(row => ({ ...row }));
        let delta = target - next.reduce((sum, row) => sum + row.amount, 0);
        let eligible = next.map((row, index) => ({ row, index })).filter(item => item.row.id !== lockedId).map(item => item.index);
        while (eligible.length && Math.abs(delta) > .0000001) {
            const share = delta / eligible.length;
            const survivors: number[] = [];
            eligible.forEach(index => {
                const candidate = next[index].amount + share;
                if (candidate < 0) { delta += next[index].amount; next[index].amount = 0; }
                else { next[index].amount = candidate; survivors.push(index); }
            });
            if (share >= 0 || survivors.length === eligible.length) break;
            eligible = survivors;
        }
        return next;
    };
    const repair = (mode: "fixedTotal" | "currentAmounts" | "fixedSolvent") => {
        if (mode === "fixedTotal") {
            const rows = spreadToTotal(draft.rows, draft.fragrance, lastChanged);
            commit({ ...draft, rows: normalizeRows(rows, draft.fragrance) });
        } else if (mode === "currentAmounts") {
            const fragrance = rowSum;
            const solvent = draft.concentration > 0 ? fragrance * (100 - draft.concentration) / draft.concentration : draft.solvent;
            commit({ ...draft, fragrance, solvent, rows: normalizeRows(draft.rows, fragrance) });
        } else {
            const fragrance = rowSum;
            const concentration = fragrance + draft.solvent > 0 ? fragrance / (fragrance + draft.solvent) * 100 : 0;
            commit({ ...draft, fragrance, concentration, rows: normalizeRows(draft.rows, fragrance) });
        }
    };
    const persist = async (mode: "overwrite" | "version") => {
        setSaving(true);
        const ingredients = Object.fromEntries((["top", "heart", "base"] as Note[]).map(note => [note, formula.ingredients[note].map(original => { const row = draft.rows.find(item => item.id === original.id)!; return { ...original, ratio: row.ratio, amount: +(row.amount * 1000).toFixed(4) }; })])) as Formula["ingredients"];
        await onSave(mode, { ...formula, fragrance: +draft.fragrance.toFixed(6), solvent: +draft.solvent.toFixed(6), concentration: +draft.concentration.toFixed(4), ingredients });
        setSaving(false);
    };
    const unit = formula.measure === "mass" ? "g" : "ml";
    return <div className="modal blendModal"><div className="dialog blendDialog">
      <div className="modalHead"><div><small>BLENDING SESSION</small><h2>开始调配 · {formula.name}</h2></div><button onClick={onClose}>×</button></div>
      <div className="blendBody">
        <div className="blendOverview"><div><span>香料总比例</span><b>{ratioTotal.toFixed(2)}%</b></div><Field label={`原料总用量（${unit}）`}><NumericInput min={0} value={draft.fragrance} onChange={value => { setSource("fragrance"); commit({ ...draft, fragrance: Math.max(0, value) }); }}/></Field><Field label={`溶剂总用量（${unit}）`}><NumericInput min={0} value={draft.solvent} onChange={value => { setSource("solvent"); commit({ ...draft, solvent: Math.max(0, value) }); }}/></Field><Field label="目标香料浓度"><UnitInput value={draft.concentration} unit="%" disabled={false} onChange={value => commit({ ...draft, concentration: Math.max(0, Math.min(100, value)) })}/></Field><button className="primary blendComplete" onClick={complete}>补全并计算用量</button></div>
        <div className={`solventBreakdown ${solventDeficit ? "deficit" : ""}`}><div><span>溶剂总量</span><b>{draft.solvent.toFixed(6)} {unit}</b><small>包含稀释香料带入的溶剂</small></div><div><span>稀释香料中的溶剂</span><b>{dilutedSolvent.toFixed(6)} {unit}</b><small>根据各原料稀释浓度自动计算</small></div><div><span>净添加溶剂</span><b>{Math.max(0, netSolvent).toFixed(6)} {unit}</b><small>实际还需要单独加入的溶剂</small></div>{solventDeficit && <p>稀释香料自带的溶剂已超过目标溶剂总量 {Math.abs(netSolvent).toFixed(6)} {unit}。请提高溶剂总量、降低稀释香料用量或调整目标浓度。</p>}</div>
        <div className="blendToolbar"><div><b>逐项称量</b><span>直接修改用量后，可选择适合的修复方式。</span></div><div><button disabled={!undoStack.current.length} onClick={undoBlend}>↶ 撤销</button><button disabled={!redoStack.current.length} onClick={redoBlend}>↷ 重做</button></div></div>
        <div className="blendTable"><div className="blendRow blendTh"><span>原料</span><span>配方比例</span><span>具体用量</span><span>当前占比</span></div>{(["top", "heart", "base"] as Note[]).flatMap(note => draft.rows.filter(row => row.note === note).map(row => { const dilution = dilutionForRow(row), material = dilution.material; return <div className={`blendRow ${material?.diluted ? "dilutedBlendRow" : ""}`} key={row.id}><span><i className={`blendDot ${note}`}/><span className="blendMaterialName"><b>{material?.cn || row.name || "未命名原料"}</b><small>{noteMeta[note].label}{material?.diluted ? ` · 已稀释 ${dilution.concentration}% · ${material.solvent || "未注明溶剂"}` : ""}</small>{material?.diluted && <em>本行带入溶剂 {dilution.solvent.toFixed(6)} {unit}</em>}</span></span><span>{row.ratio.toFixed(2)}%</span><span><div className="unitInput"><NumericInput min={0} value={+row.amount.toFixed(6)} onChange={value => { setLastChanged(row.id); commit({ ...draft, rows: draft.rows.map(item => item.id === row.id ? { ...item, amount: Math.max(0, value) } : item) }); }}/><b>{unit}</b></div></span><span>{rowSum ? (row.amount / rowSum * 100).toFixed(2) : "0.00"}%</span></div>; }))}</div>
        {needsRepair && <div className="blendRepair"><div><b>当前称量与配方比例不一致</b><span>选择一种修复方式。所有修复均可使用 Ctrl+Z / Ctrl+Y 撤销或重做。</span></div><div className="repairChoices"><button onClick={() => repair("fixedTotal")}><b>固定总香料与溶剂</b><span>保留刚修改的原料，向其他原料平均分配差额并重算比例。</span></button><button onClick={() => repair("currentAmounts")}><b>以当前逐项用量为准</b><span>保留所有称量，重算香料总量、各项比例及溶剂量。</span></button><button onClick={() => repair("fixedSolvent")}><b>固定溶剂与逐项用量</b><span>保留溶剂和所有称量，重算香料总量、比例及实际浓度。</span></button></div></div>}
      </div>
      <div className="blendFooter"><span>{solventDeficit ? "请先修正溶剂总量后再保存" : "保存本次调配结果"}</span><button disabled={saving || solventDeficit} onClick={() => persist("overwrite")}>覆盖当前版本</button><button className="primary" disabled={saving || solventDeficit} onClick={() => persist("version")}>另存为 v{nextVersion(formula.version)}</button></div>
    </div></div>;
}
export function NoteSection({ note, formula, materials, editing, update, showToneHints }: {
    note: Note;
    formula: Formula;
    materials: Material[];
    editing: boolean;
    update: (p: Partial<Formula>) => void;
    showToneHints: boolean;
}) {
    const rows = formula.ingredients[note];
    const sum = rows.reduce((s, x) => s + (Number(x.ratio) || 0), 0);
    const set = (next: Ingredient[]) => update({ ingredients: { ...formula.ingredients, [note]: next } });
    const patchRow = (idx: number, patch: Partial<Ingredient>) => set(rows.map((x, i) => i === idx ? { ...x, ...patch } : x));
    return <div className="noteBlock ratioOnlyBlock"><div className="noteTitle"><div><b>{noteMeta[note].label}</b><small>{noteMeta[note].sub}</small></div><span>{sum.toFixed(2)}%</span></div>
    <div className="table"><div className="tr th"><span>香料名称</span><span>蒸气压（25℃）</span><span>比例</span><span /></div>{rows.map((r, idx) => { const hasName = !!r.name.trim(); const material = hasName ? (materials.find(m => m.id === r.materialId) || materials.find(m => m.cn === r.name || m.en === r.name)) : undefined; const vapor = material?.vaporPressure !== undefined && material.vaporPressure !== "" ? `${material.vaporPressure} Pa` : "—"; return <div className="ingredientWrap" key={r.id}><div className="tr"><span className="materialCell"><input list="all-materials" disabled={!editing} value={r.name} onChange={e => { const m = e.target.value.trim() ? materials.find(v => v.cn === e.target.value || v.en === e.target.value) : undefined; patchRow(idx, { name: e.target.value, materialId: m?.id }); }}/><datalist id="all-materials">{materials.map(m => <option key={m.id} value={m.cn}>{m.en} · {noteMeta[m.note].label}</option>)}</datalist>{showToneHints && material && material.note !== note && <small className="toneWarning">注意：原料归类为{noteMeta[material.note].label}</small>}</span><span className={`editorVapor ${vapor === "—" ? "empty" : ""}`}>{vapor}</span><span><NumericInput disabled={!editing} value={r.ratio} onChange={ratio => patchRow(idx, { ratio })}/></span><span>{editing && <button className="removeRow" aria-label="删除香料" onClick={() => set(rows.filter((_, i) => i !== idx))}>×</button>}</span></div></div>; })}</div>{editing && <button className="addrow" onClick={() => set([...rows, { id: uid(), name: "", ratio: 0, amount: 0 }])}>＋ 添加{noteMeta[note].label}香料</button>}
  </div>;
}
export function FormulaLibrary({ formulas, groups, query, onOpen, onCreate, onCreateVersion, onDelete, onNewGroup, onDeleteGroup, onAssign }: {
    formulas: Formula[];
    groups: Group[];
    query: string;
    onOpen: (id: string) => void;
    onCreate: () => void;
    onCreateVersion: (source: Formula) => void;
    onDelete: (ids: string[]) => void;
    onNewGroup: () => void;
    onDeleteGroup: (id: string) => void;
    onAssign: (id: string, tagId: string) => void;
}) {
    const [active, setActive] = useState("all");
    const [expanded, setExpanded] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const visible = formulas.filter(f => (f.name + f.version + f.use).toLowerCase().includes(query.toLowerCase()) && (active === "all" || (active === "ungrouped" ? !tagIdsFor(f).length : tagIdsFor(f).includes(active))));
    const stacks = Object.values(visible.reduce<Record<string, Formula[]>>((acc, f) => { const key = f.name.trim().toLocaleLowerCase(); (acc[key] ??= []).push(f); return acc; }, {})).map(items => items.sort((a, b) => compareVersions(b.version, a.version))).sort((a, b) => a[0].name.localeCompare(b[0].name, "zh-CN"));
    const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
    return <div className="materialPage"><div className="titleline"><div><p>配方库</p><h1>我的配方</h1></div><span>{visible.length} 个版本 · {stacks.length} 个配方</span></div><GroupBar groups={groups} active={active} onChange={setActive} onNew={onNewGroup} onDelete={id => {
            if (active === id)
                setActive("all");
            onDeleteGroup(id);
        }}/>{selectedIds.length > 0 && <div className="batchBar"><b>已选择 {selectedIds.length} 个版本</b><button onClick={() => setSelectedIds([])}>取消选择</button><button className="batchDelete" onClick={() => { onDelete(selectedIds); setSelectedIds([]); }}>删除所选版本</button></div>}<div className="formulaGrid">{stacks.map(versions => { const latest = versions[0]; const key = latest.name.trim().toLocaleLowerCase(); const isOpen = expanded.includes(key); const ids = versions.map(f => f.id); const allSelected = ids.every(id => selectedIds.includes(id)); return <article className={`formulaTile formulaStack ${isOpen ? "expanded" : ""}`} key={key}><div><span className="use">{latest.use}</span><label className="selectAllVersions"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(old => allSelected ? old.filter(id => !ids.includes(id)) : [...new Set([...old, ...ids])])}/>选择全部版本</label><small>{versions.length > 1 ? `${versions.length} 个版本` : `VERSION ${latest.version}`}</small></div><h3>{latest.name}</h3><p>最新版本 v{latest.version} · {latest.ingredients.top.length + latest.ingredients.heart.length + latest.ingredients.base.length} 种原料</p><time>{latest.created}</time><div className="stackActions"><button onClick={() => onOpen(latest.id)}>打开{versions.length > 1 ? "最新版本" : "配方"}</button><button className="newVersionButton" onClick={() => onCreateVersion(latest)}>＋ 新建版本</button>{versions.length > 1 && <button className="foldButton" onClick={() => setExpanded(x => x.includes(key) ? x.filter(v => v !== key) : [...x, key])}>{isOpen ? "收起版本" : "选择 / 查看版本"} <span>{isOpen ? "⌃" : "⌄"}</span></button>}</div>{versions.length === 1 && <TagPicker groups={groups} selected={tagIdsFor(latest)} onToggle={tagId => onAssign(latest.id, tagId)}/>} {isOpen && <div className="versionList">{versions.map(f => <div className="versionRow tagVersionRow" key={f.id}><label className="versionCheck"><input type="checkbox" checked={selectedIds.includes(f.id)} onChange={() => toggle(f.id)}/></label><button onClick={() => onOpen(f.id)}><b>v{f.version}</b><span>{f.created}</span></button><TagPicker groups={groups} selected={tagIdsFor(f)} onToggle={tagId => onAssign(f.id, tagId)}/></div>)}</div>}</article>; })}<button className="newMaterial" onClick={onCreate}>＋<span>新建配方</span></button></div></div>;
}
