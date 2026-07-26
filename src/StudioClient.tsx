"use client";
import { useEffect, useRef, useState } from "react";
import type { Evaluation, Formula, Group, GuestStore, Ingredient, Material, Note, VaporSettings, VaporSource } from "./domain/models";
import { compareVersions, emptyEvaluation, emptyFormula, nextVersion, noteMeta, tagIdsFor, today, uid } from "./domain/formula";
import { defaultVaporSettings, demoFormula, demoMaterials } from "./domain/fixtures";
import { readGuestStore, syncLocalStore, writeGuestStore } from "./services/localStore";
import { Field, NumericInput, ScoreInput, UnitInput } from "./components/common/FormControls";
import { GroupBar, TagDisplay, TagEditor, TagPicker } from "./components/tags/TagControls";
export default function StudioClient() {
    const dataSync = (action: string, payload: unknown = {}) => syncLocalStore(action, payload);
    const [tab, setTab] = useState<"formulas" | "editor" | "materials">("formulas");
    const [formulas, setFormulas] = useState<Formula[]>([demoFormula]);
    const [materials, setMaterials] = useState<Material[]>(demoMaterials);
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupModal, setGroupModal] = useState<Group["kind"] | null>(null);
    const [selected, setSelected] = useState("f1");
    const [editing, setEditing] = useState(false);
    const [query, setQuery] = useState("");
    const [materialModal, setMaterialModal] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [saved, setSaved] = useState(true);
    const [saveError, setSaveError] = useState("");
    const [copyStatus, setCopyStatus] = useState("");
    const [toneHints, setToneHints] = useState(true);
    const [blendOpen, setBlendOpen] = useState(false);
    const importRef = useRef<HTMLInputElement>(null);
    const [, setHistoryTick] = useState(0);
    const undoRef = useRef<Formula[]>([]);
    const redoRef = useRef<Formula[]>([]);
    useEffect(() => {
        dataSync("list").then((x: {
            formulas: Formula[];
            materials: Material[];
            groups: Group[];
        }) => {
            if (x.formulas.length) {
                setFormulas(x.formulas);
                setSelected(x.formulas[0].id);
            }
            if (x.materials.length)
                setMaterials(x.materials);
            if (x.groups)
                setGroups(x.groups);
        }).catch(() => { });
    }, []);
    const formula = formulas.find(f => f.id === selected) || formulas[0];
    const update = (patch: Partial<Formula>) => { setSaved(false); setSaveError(""); setFormulas(fs => fs.map(f => f.id === formula.id ? { ...f, ...patch } : f)); };
    const restore = (snapshot: Formula) => { setSaved(false); setFormulas(fs => fs.map(f => f.id === snapshot.id ? snapshot : f)); setHistoryTick(x => x + 1); };
    const applyCalculated = (next: Formula) => { undoRef.current.push(structuredClone(formula)); redoRef.current = []; restore(next); };
    const undo = () => {
        const prev = undoRef.current.pop();
        if (!prev)
            return;
        redoRef.current.push(structuredClone(formula));
        restore(prev);
    };
    const redo = () => {
        const next = redoRef.current.pop();
        if (!next)
            return;
        undoRef.current.push(structuredClone(formula));
        restore(next);
    };
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (!editing || !(e.ctrlKey || e.metaKey))
                return;
            if (e.key.toLowerCase() === "z") {
                e.preventDefault();
                e.shiftKey ? redo() : undo();
            }
            else if (e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [editing, formula]);
    const save = async () => {
        const name = formula.name.trim().toLocaleLowerCase();
        const version = formula.version.trim();
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
            setSaveError("版本号必须使用 x.x.x 格式，例如 1.0.0。");
            return;
        }
        if (formulas.some(f => f.id !== formula.id && f.name.trim().toLocaleLowerCase() === name && f.version.trim().toLocaleLowerCase() === version)) {
            setSaveError(`“${formula.name}”的 ${formula.version} 版本已经存在，请修改版本号后再保存。`);
            return;
        }
        await dataSync("save", { kind: "formula", record: { ...formula, name: formula.name.trim(), version: formula.version.trim() } });
        setSaved(true);
        setSaveError("");
        setEditing(false);
    };
    const create = () => { const f = emptyFormula(); setFormulas(x => [f, ...x]); setSelected(f.id); setSaved(false); setEditing(true); setTab("editor"); };
    const createVersion = (source: Formula) => { const f: Formula = { ...structuredClone(source), id: uid(), version: nextVersion(source.version), created: today(), ingredients: Object.fromEntries((Object.keys(source.ingredients) as Note[]).map(note => [note, source.ingredients[note].map(item => ({ ...item, id: uid() }))])) as Formula["ingredients"] }; setFormulas(items => [f, ...items]); setSelected(f.id); setSaved(false); setSaveError(""); setEditing(true); setTab("editor"); undoRef.current = []; redoRef.current = []; };
    const saveBlend = async (mode: "overwrite" | "version", blended: Formula) => {
        const record = mode === "version"
            ? { ...blended, id: uid(), version: nextVersion(formula.version), created: today(), ingredients: Object.fromEntries((Object.keys(blended.ingredients) as Note[]).map(note => [note, blended.ingredients[note].map(item => ({ ...item, id: uid() }))])) as Formula["ingredients"] }
            : blended;
        await dataSync("save", { kind: "formula", record });
        setFormulas(items => mode === "version" ? [record, ...items] : items.map(item => item.id === record.id ? record : item));
        setSelected(record.id);
        setSaved(true);
        setEditing(false);
        setBlendOpen(false);
    };
    const openFormula = (id: string) => { setSelected(id); setEditing(false); setSaved(true); setTab("editor"); undoRef.current = []; redoRef.current = []; };
    const remove = async () => {
        if (formulas.length === 1)
            return;
        await dataSync("delete", { kind: "formula", id: formula.id });
        const next = formulas.filter(x => x.id !== formula.id);
        setFormulas(next);
        setSelected(next[0].id);
        setTab("formulas");
    };
    const deleteFormulas = async (ids: string[]) => {
        if (!ids.length || !confirm(`确定删除选中的 ${ids.length} 个配方版本吗？此操作无法撤销。`))
            return;
        await Promise.all(ids.map(id => dataSync("delete", { kind: "formula", id })));
        const next = formulas.filter(f => !ids.includes(f.id));
        setFormulas(next);
        setSelected(next[0]?.id || "");
    };
    const deleteMaterials = async (ids: string[]) => {
        if (!ids.length || !confirm(`确定删除选中的 ${ids.length} 种原料吗？此操作无法撤销。`))
            return;
        await Promise.all(ids.map(id => dataSync("delete", { kind: "material", id })));
        setMaterials(ms => ms.filter(m => !ids.includes(m.id)));
    };
    const saveGroup = async (name: string, kind: Group["kind"]) => { const g = { id: uid(), name, kind }; setGroups(x => [...x, g]); await dataSync("save", { kind: "group", record: g }); setGroupModal(null); };
    const createInlineTag = async (name: string, kind: Group["kind"]) => { const g = { id: uid(), name, kind }; setGroups(x => [...x, g]); await dataSync("save", { kind: "group", record: g }); return g.id; };
    const deleteGroup = async (id: string) => { const affectedF = formulas.filter(x => tagIdsFor(x).includes(id)).map(x => ({ ...x, groupId: undefined, tagIds: tagIdsFor(x).filter(v => v !== id) })); const affectedM = materials.filter(x => tagIdsFor(x).includes(id)).map(x => ({ ...x, groupId: undefined, tagIds: tagIdsFor(x).filter(v => v !== id) })); setFormulas(fs => fs.map(x => tagIdsFor(x).includes(id) ? { ...x, groupId: undefined, tagIds: tagIdsFor(x).filter(v => v !== id) } : x)); setMaterials(ms => ms.map(x => tagIdsFor(x).includes(id) ? { ...x, groupId: undefined, tagIds: tagIdsFor(x).filter(v => v !== id) } : x)); setGroups(gs => gs.filter(g => g.id !== id)); await Promise.all([...affectedF.map(record => dataSync("save", { kind: "formula", record })), ...affectedM.map(record => dataSync("save", { kind: "material", record })), dataSync("delete", { kind: "group", id })]); };
    const assignFormula = async (id: string, tagId: string) => { const current = formulas.find(f => f.id === id)!; const tags = tagIdsFor(current); const record = { ...current, groupId: undefined, tagIds: tags.includes(tagId) ? tags.filter(v => v !== tagId) : [...tags, tagId] }; setFormulas(fs => fs.map(f => f.id === id ? record : f)); await dataSync("save", { kind: "formula", record }); };
    const assignMaterial = async (id: string, tagId: string) => { const current = materials.find(m => m.id === id)!; const tags = tagIdsFor(current); const record = { ...current, groupId: undefined, tagIds: tags.includes(tagId) ? tags.filter(v => v !== tagId) : [...tags, tagId] }; setMaterials(ms => ms.map(m => m.id === id ? record : m)); await dataSync("save", { kind: "material", record }); };
    const allIngredients = Object.values(formula?.ingredients || {}).flat();
    const total = allIngredients.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const ratioTotal = allIngredients.reduce((s, i) => s + (Number(i.ratio) || 0), 0);
    const ratioOver = ratioTotal > 100.00005;
    const ratioUnder = ratioTotal < 99.99995;
    const materialFor = (i: Ingredient) => materials.find(m => m.id === i.materialId) || materials.find(m => m.cn === i.name || m.en === i.name);
    const dilutedSolvent = allIngredients.reduce((s, i) => { const m = materialFor(i); return s + (m?.diluted ? (Number(i.amount) || 0) * (1 - (Number(m.concentration) || 0) / 100) : 0); }, 0);
    const pureTotal = allIngredients.reduce((s, i) => { const m = materialFor(i); return s + (Number(i.amount) || 0) * (m?.diluted ? (Number(m.concentration) || 0) / 100 : 1); }, 0);
    const solutionTotal = (Number(formula?.fragrance) || 0) + (Number(formula?.solvent) || 0);
    const actualConcentration = solutionTotal > 0 ? (Number(formula?.fragrance) || 0) / solutionTotal * 100 : 0;
    const concentrationMismatch = solutionTotal > 0 && Math.abs(actualConcentration - (Number(formula?.concentration) || 0)) > 0.01;
    const fixConcentration = () => {
        const c = Number(formula.concentration) || 0;
        if (c <= 0 || c > 100)
            return;
        update({ solvent: +(formula.fragrance * (100 - c) / c).toFixed(6) });
    };
    const markdownForFormula = () => {
        const section = (note: Note) => {
            const rows = formula.ingredients[note];
            const ratio = rows.reduce((sum, item) => sum + (Number(item.ratio) || 0), 0);
            const body = rows.map(item => {
                const material = materialFor(item);
                const name = material ? `**${material.cn}**（${material.en}）` : `**${item.name || "未命名香料"}**`;
                return `| ${name} | ${Number(item.ratio).toFixed(2)}% |`;
            }).join("\n");
            return `### ${noteMeta[note].label}\n| 香料名称 | 比例 |\n| --- | --- |\n${body}${body ? "\n" : ""}| 合计 | ${ratio.toFixed(2)}% |`;
        };
        const evaluation = formula.evaluation ? `### 试香评估\n试香日期：${formula.evaluation.testedAt || "未记录"}；静置：${formula.evaluation.restDays || 0} 天\n扩散 / 香迹 / 留香：${formula.evaluation.projection}/5 · ${formula.evaluation.sillage}/5 · ${formula.evaluation.longevity || 0} 小时\n开场：${formula.evaluation.opening || "无"}\n中段：${formula.evaluation.heart || "无"}\n尾调：${formula.evaluation.drydown || "无"}\n下一版：${formula.evaluation.nextStep || "无"}` : "";
        return `## ${formula.name} ${formula.version}\n### 基本信息\n用途：${formula.use}\n定量方式：${formula.measure === "mass" ? "质量" : "体积"}\n目标浓度：${Number(formula.concentration).toFixed(2)}%\n溶剂：${formula.solventType}\n\n${section("top")}\n\n${section("heart")}\n\n${section("base")}\n\n${evaluation}\n\n### 备注\n${formula.notes || "无"}`;
    };
    const copyMarkdown = async () => {
        try {
            await navigator.clipboard.writeText(markdownForFormula());
            setCopyStatus("已复制 Markdown");
        }
        catch {
            setCopyStatus("复制失败，请重试");
        }
        setTimeout(() => setCopyStatus(""), 2200);
    };
    const normalizeBy = (ingredients: Formula["ingredients"], weight: (item: Ingredient) => number) => { const rows = Object.values(ingredients).flat(), sum = rows.reduce((value, item) => value + Math.max(0, weight(item)), 0); let seen = 0, assigned = 0; return Object.fromEntries((Object.keys(ingredients) as Note[]).map(note => [note, ingredients[note].map(item => { seen += 1; const ratio = !sum ? 0 : seen === rows.length ? +(100 - assigned).toFixed(4) : +(Math.max(0, weight(item)) / sum * 100).toFixed(4); assigned += ratio; return { ...item, ratio }; })])) as Formula["ingredients"]; };
    const rebalance = (ingredients: Formula["ingredients"]) => { const rows = Object.values(ingredients).flat(); const sum = rows.reduce((s, i) => s + (Number(i.amount) || 0), 0); const fixed = normalizeBy(ingredients, item => Number(item.amount) || 0); const fragrance = +(sum / 1000).toFixed(6); const solvent = formula.concentration > 0 ? +(fragrance * (100 - formula.concentration) / formula.concentration).toFixed(6) : 0; applyCalculated({ ...formula, ingredients: fixed, fragrance, solvent }); };
    const scaleRatiosTo100 = () => { if (ratioTotal <= 0 || !ratioUnder) return; const normalized = normalizeBy(formula.ingredients, item => Number(item.ratio) || 0); const ingredients = Object.fromEntries((Object.keys(normalized) as Note[]).map(note => [note, normalized[note].map(item => ({ ...item, amount: +(formula.fragrance * 1000 * item.ratio / 100).toFixed(4) }))])) as Formula["ingredients"]; applyCalculated({ ...formula, ingredients }); };
    const stepIngredient = (note: Note, id: string, direction: 1 | -1) => { if (ratioUnder) return; const step = formula.adjustmentStep ?? 10; const next = { ...formula.ingredients, [note]: formula.ingredients[note].map(i => i.id === id ? { ...i, amount: Math.max(0, +(i.amount + direction * step).toFixed(4)) } : i) }; rebalance(next); };
    const exportGuestBackup = () => {
        const blob = new Blob([JSON.stringify({ app: "调香手记", version: 1, exportedAt: new Date().toISOString(), data: readGuestStore() }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `调香手记-本地备份-${today()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };
    const importGuestBackup = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text()) as { data?: Partial<GuestStore> } | Partial<GuestStore>;
            const source = (("data" in parsed ? parsed.data : parsed) || {}) as Partial<GuestStore>;
            const next: GuestStore = { formulas: Array.isArray(source.formulas) ? source.formulas : [], materials: Array.isArray(source.materials) ? source.materials : [], groups: Array.isArray(source.groups) ? source.groups : [], settings: Array.isArray(source.settings) ? source.settings : [] };
            if (!confirm(`导入将替换当前本地数据。备份中包含 ${next.formulas.length} 个配方版本和 ${next.materials.length} 种原料，是否继续？`)) return;
            writeGuestStore(next);
            setFormulas(next.formulas.length ? next.formulas : [demoFormula]);
            setMaterials(next.materials.length ? next.materials : demoMaterials);
            setGroups(next.groups);
            setSelected(next.formulas[0]?.id || "f1");
            setTab("formulas");
        } catch { alert("无法读取该备份文件，请确认它来自调香手记。"); }
    };
    return <main>
    <aside>
      <div className="brand homeBrand"><img className="brandmark brandIcon" src="./app-icon.png" alt="调香手记图标"/><div><b>调香手记</b><small>FORMULA STUDIO</small></div></div>
      <nav>
        <button className={tab === "formulas" || tab === "editor" ? "active" : ""} onClick={() => setTab("formulas")}><span>▤</span>配方库<i>{formulas.length}</i></button>
        <button className={tab === "materials" ? "active" : ""} onClick={() => setTab("materials")}><span>◇</span>原料库<i>{materials.length}</i></button>
      </nav>
      <div className="sidefoot accountFoot localFoot">
        <div className="accountRow"><span className="accountAvatar">本</span><span><b>本地模式</b><small>数据仅保存在此电脑</small></span></div>
        <div><span className="syncdot localDot"/> 自动保存已开启</div><div className="guestTools"><button onClick={exportGuestBackup}>导出备份</button><button onClick={() => importRef.current?.click()}>导入备份</button></div><input ref={importRef} className="hiddenFileInput" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importGuestBackup(file); event.currentTarget.value = ""; }}/>
      </div>
    </aside>
    <section className="workspace">
      <header><div className="mobilebrand">调香手记</div>{tab !== "editor" ? <div className="search">⌕ <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tab === "formulas" ? "搜索配方…" : "搜索原料…"}/><kbd>Ctrl K</kbd></div> : <div className="editorCrumb"><button onClick={() => setTab("formulas")}>配方库</button><span>／</span><b>{formula?.name}</b></div>}<div className="headerStorage guest"><span>●</span>本机保存</div><button className="primary" onClick={tab === "formulas" ? create : tab === "materials" ? () => { setEditingMaterial(null); setMaterialModal(true); } : () => setTab("formulas")}>{tab !== "editor" ? "＋ " : "← "}{tab === "formulas" ? "新建配方" : tab === "materials" ? "添加原料" : "返回配方库"}</button></header>
      {tab === "formulas" ? <FormulaLibrary formulas={formulas} groups={groups.filter(g => g.kind === "formula")} query={query} onOpen={openFormula} onCreate={create} onCreateVersion={createVersion} onDelete={deleteFormulas} onNewGroup={() => setGroupModal("formula")} onDeleteGroup={deleteGroup} onAssign={assignFormula}/> : tab === "editor" && formula ? (!editing ? <FormulaReader formula={formula} materials={materials} groups={groups.filter(g => g.kind === "formula")} onEdit={() => setEditing(true)} onBlend={() => setBlendOpen(true)} onCopy={copyMarkdown} onDelete={remove} copyStatus={copyStatus}/> : <div className="editor editorFull"><div className="editorHead"><div className="editorIdentity"><span className="eyebrow">编辑配方 · VERSION {formula.version}</span><input className="nameInput" value={formula.name} onChange={e => update({ name: e.target.value })}/>{saveError && <small className="saveError">{saveError}</small>}</div><div className="actions"><button onClick={() => setBlendOpen(true)}>开始调配</button><button onClick={() => { setEditing(false); setSaveError(""); }}>取消</button><button className="primary" onClick={save}>保存配方</button></div></div>
          <div className="sheet"><h4><span>01</span> 基本配方信息</h4><div className="formgrid">
            <Field label="版本号"><input disabled={!editing} inputMode="numeric" pattern="\d+\.\d+\.\d+" placeholder="1.0.0" value={formula.version} onChange={e => update({ version: e.target.value })}/></Field><Field label="创建日期"><input type="date" disabled={!editing} value={formula.created} onChange={e => update({ created: e.target.value })}/></Field>
            <Field label="定量单位"><div className="seg"><button disabled={!editing} className={formula.measure === "mass" ? "on" : ""} onClick={() => update({ measure: "mass" })}>质量</button><button disabled={!editing} className={formula.measure === "volume" ? "on" : ""} onClick={() => update({ measure: "volume" })}>体积</button></div></Field><Field label="用途类型"><select disabled={!editing} value={formula.use} onChange={e => update({ use: e.target.value as Formula["use"] })}><option>香水</option><option>香薰</option><option>香基</option></select></Field>
            <Field label="香料浓度"><UnitInput disabled={!editing} value={formula.concentration} unit="%" onChange={v => update({ concentration: v })}/></Field><Field label="溶剂种类"><input disabled={!editing} value={formula.solventType} onChange={e => update({ solventType: e.target.value })}/></Field>
          </div><div className="formulaTagArea"><TagEditor groups={groups.filter(g => g.kind === "formula")} selected={tagIdsFor(formula)} onToggle={tagId => assignFormula(formula.id, tagId)} onCreate={name => createInlineTag(name, "formula")}/></div></div>
          <div className="sheet"><h4><span>02</span> 香料比例 <button className={`toneHintToggle ${toneHints ? "on" : ""}`} onClick={() => setToneHints(value => !value)} aria-pressed={toneHints}>前中后调提示 {toneHints ? "开" : "关"}</button></h4>
            <div className="calcbar"><div><span>比例合计</span><b className={ratioOver ? "over" : ""}>{ratioTotal.toFixed(2)}%</b></div>{editing && ratioUnder && ratioTotal > 0 && <button className="scaleRatiosButton" onClick={scaleRatiosTo100}>等比例放大至 100%</button>}</div>
            {ratioOver && <div className="ratioWarning"><div><b>比例已超出 100%</b><span>当前合计 {ratioTotal.toFixed(2)}%。自动修复会保持各原料之间的相对比例。</span></div><button onClick={scaleRatiosTo100}>自动修复</button></div>}
            {editing && ratioUnder && ratioTotal > 0 && <div className="ratioUnderNotice">比例未满 100%，可以等比例放大或手动补足。</div>}
            {(["top", "heart", "base"] as Note[]).map(note => <NoteSection key={note} note={note} formula={formula} materials={materials} editing={editing} update={update} showToneHints={toneHints}/>)}</div>
          <div className="sheet evaluationSheet"><h4><span>03</span> 试香评估 <em>记录可比较的客观表现与后续方向</em></h4>{(() => { const assessment = formula.evaluation ?? emptyEvaluation(); const setEvaluation = (patch: Partial<Evaluation>) => update({ evaluation: { ...assessment, ...patch } }); return <><div className="evaluationMetrics"><Field label="试香日期"><input type="date" disabled={!editing} value={assessment.testedAt} onChange={e => setEvaluation({ testedAt: e.target.value })}/></Field><Field label="静置天数"><UnitInput disabled={!editing} value={assessment.restDays} unit="天" onChange={v => setEvaluation({ restDays: Math.max(0, v) })}/></Field><Field label="扩散力"><ScoreInput disabled={!editing} value={assessment.projection} onChange={v => setEvaluation({ projection: v })}/></Field><Field label="香迹"><ScoreInput disabled={!editing} value={assessment.sillage} onChange={v => setEvaluation({ sillage: v })}/></Field><Field label="留香时间"><UnitInput disabled={!editing} value={assessment.longevity} unit="小时" onChange={v => setEvaluation({ longevity: Math.max(0, v) })}/></Field></div><Field label="下一版本修改方向"><textarea disabled={!editing} value={assessment.nextStep} onChange={e => setEvaluation({ nextStep: e.target.value })} placeholder="例如：减少甜感、加强开场扩散、保留当前尾调…"/></Field></>; })()}</div>
          <div className="sheet"><h4><span>04</span> 调香备注</h4><textarea disabled={!editing} value={formula.notes} onChange={e => update({ notes: e.target.value })} placeholder="记录制作过程、原料批次或与上一版本的差异…"/></div>
        </div>) : <Materials materials={materials} groups={groups.filter(g => g.kind === "material")} query={query} onAdd={() => { setEditingMaterial(null); setMaterialModal(true); }} onEdit={m => { setEditingMaterial(m); setMaterialModal(true); }} onDelete={deleteMaterials} onNewGroup={() => setGroupModal("material")} onDeleteGroup={deleteGroup} onAssign={assignMaterial}/>} 
    </section>
    {materialModal && <MaterialModal initial={editingMaterial} groups={groups.filter(g => g.kind === "material")} onCreateTag={name => createInlineTag(name, "material")} onClose={() => { setMaterialModal(false); setEditingMaterial(null); }} onSave={async (m) => { const duplicate=materials.some(v=>v.id!==m.id&&v.cn.trim().toLocaleLowerCase()===m.cn.trim().toLocaleLowerCase()&&v.en.trim().toLocaleLowerCase()===m.en.trim().toLocaleLowerCase()); if(duplicate)throw new Error("已有中文名和英文名均相同的原料，请修改名称后再保存。"); await dataSync("save", { kind: "material", record: m }); setMaterials(x => editingMaterial ? x.map(v => v.id === m.id ? m : v) : [m, ...x]); setMaterialModal(false); setEditingMaterial(null); }}/>} 
    {groupModal && <GroupModal kind={groupModal} onClose={() => setGroupModal(null)} onSave={name => saveGroup(name, groupModal)}/>} 
    {blendOpen && formula && <BlendModal formula={formula} materials={materials} onClose={() => setBlendOpen(false)} onSave={saveBlend}/>}
  </main>;
}

function FormulaReader({ formula, materials, groups, onEdit, onBlend, onCopy, onDelete, copyStatus }: {
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
function BlendModal({ formula, materials, onClose, onSave }: {
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
function NoteSection({ note, formula, materials, editing, update, showToneHints }: {
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
function FormulaLibraryLegacy({ formulas, groups, query, onOpen, onCreate, onDelete, onNewGroup, onDeleteGroup, onAssign }: {
    formulas: Formula[];
    groups: Group[];
    query: string;
    onOpen: (id: string) => void;
    onCreate: () => void;
    onDelete: (ids: string[]) => void;
    onNewGroup: () => void;
    onDeleteGroup: (id: string) => void;
    onAssign: (id: string, groupId: string) => void;
}) {
    const [active, setActive] = useState("all");
    const [expanded, setExpanded] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const qs = query.toLowerCase();
    const visible = formulas.filter(f => (f.name + f.version + f.use).toLowerCase().includes(qs) && (active === "all" || (active === "ungrouped" ? !tagIdsFor(f).length : tagIdsFor(f).includes(active))));
    const stacks = Object.values(visible.reduce<Record<string, Formula[]>>((acc, f) => { const key = f.name.trim().toLocaleLowerCase(); (acc[key] ??= []).push(f); return acc; }, {})).map(items => items.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: "base" }))).sort((a, b) => a[0].name.localeCompare(b[0].name, "zh-CN"));
    const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
    return <div className="materialPage"><div className="titleline"><div><p>配方库</p><h1>我的配方</h1></div><span>{visible.length} 个版本 · {stacks.length} 个配方</span></div><GroupBar groups={groups} active={active} onChange={setActive} onNew={onNewGroup} onDelete={id => {
            if (active === id)
                setActive("all");
            onDeleteGroup(id);
        }}/>{selectedIds.length > 0 && <div className="batchBar"><b>已选择 {selectedIds.length} 个版本</b><button onClick={() => setSelectedIds([])}>取消选择</button><button className="batchDelete" onClick={() => { onDelete(selectedIds); setSelectedIds([]); }}>删除所选版本</button></div>}<div className="formulaGrid">{stacks.map(versions => { const latest = versions[0]; const key = latest.name.trim().toLocaleLowerCase(); const isOpen = expanded.includes(key); const versionIds = versions.map(f => f.id); const allSelected = versionIds.every(id => selectedIds.includes(id)); return <article className={`formulaTile formulaStack ${isOpen ? "expanded" : ""}`} key={key}><div><span className="use">{latest.use}</span><label className="selectAllVersions"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(ids => allSelected ? ids.filter(id => !versionIds.includes(id)) : [...new Set([...ids, ...versionIds])])}/>选择全部版本</label><small>{versions.length > 1 ? `${versions.length} 个版本` : `VERSION ${latest.version}`}</small></div><h3>{latest.name}</h3><p>最新版本 v{latest.version} · {latest.ingredients.top.length + latest.ingredients.heart.length + latest.ingredients.base.length} 种原料</p><time>{latest.created}</time><div className="stackActions"><button onClick={() => onOpen(latest.id)}>打开{versions.length > 1 ? "最新版本" : "配方"}</button>{versions.length > 1 && <button className="foldButton" onClick={() => setExpanded(x => x.includes(key) ? x.filter(v => v !== key) : [...x, key])}>{isOpen ? "收起版本" : "选择 / 查看版本"} <span>{isOpen ? "⌃" : "⌄"}</span></button>}</div>{versions.length === 1 && <label>分组<select value={latest.groupId || ""} onChange={e => onAssign(latest.id, e.target.value)}><option value="">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{isOpen && <div className="versionList">{versions.map(f => <div className="versionRow" key={f.id}><label className="versionCheck"><input type="checkbox" checked={selectedIds.includes(f.id)} onChange={() => toggle(f.id)}/></label><button onClick={() => onOpen(f.id)}><b>v{f.version}</b><span>{f.created}</span></button><label>分组<select value={f.groupId || ""} onChange={e => onAssign(f.id, e.target.value)}><option value="">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>)}</div>}</article>; })}<button className="newMaterial" onClick={onCreate}>＋<span>新建配方</span></button></div></div>;
}
function MaterialsLegacy({ materials, groups, query, onAdd, onEdit, onDelete, onNewGroup, onDeleteGroup, onAssign }: {
    materials: Material[];
    groups: Group[];
    query: string;
    onAdd: () => void;
    onEdit: (m: Material) => void;
    onDelete: (ids: string[]) => void;
    onNewGroup: () => void;
    onDeleteGroup: (id: string) => void;
    onAssign: (id: string, groupId: string) => void;
}) {
    const [active, setActive] = useState("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [toneFocus, setToneFocus] = useState<Note | null>(null);
    const [sortMode, setSortMode] = useState<"time" | "note" | "vapor">("time");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [vaporWarning,setVaporWarning]=useState(false);
    const qs = query.toLowerCase();
    const visible = materials.filter(m => (m.cn + m.en).toLowerCase().includes(qs) && (active === "all" || (active === "ungrouped" ? !m.groupId : m.groupId === active)));
    const noteOrder: Record<Note, number> = { top: 0, heart: 1, base: 2 };
    const originalOrder = new Map(materials.map((m, i) => [m.id, i]));
    const ordered = [...visible].sort((a, b) => {
        if (toneFocus) {
            const ap = a.note === toneFocus ? 0 : 1;
            const bp = b.note === toneFocus ? 0 : 1;
            if (ap !== bp)
                return ap - bp;
        }
        const av = sortMode === "note" ? noteOrder[a.note] : (a.createdAt ? Date.parse(a.createdAt) : -(originalOrder.get(a.id) || 0));
        const bv = sortMode === "note" ? noteOrder[b.note] : (b.createdAt ? Date.parse(b.createdAt) : -(originalOrder.get(b.id) || 0));
        const result = av - bv;
        return sortDirection === "asc" ? result : -result;
    });
    const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
    return <div className="materialPage"><div className="titleline"><div><p>原料库</p><h1>我的香料</h1></div><span>{visible.length} 种原料</span></div><GroupBar groups={groups} active={active} onChange={setActive} onNew={onNewGroup} onDelete={id => {
            if (active === id)
                setActive("all");
            onDeleteGroup(id);
        }}/>{selectedIds.length > 0 && <div className="batchBar"><b>已选择 {selectedIds.length} 种原料</b><button onClick={() => setSelectedIds([])}>取消选择</button><button className="batchDelete" onClick={() => { onDelete(selectedIds); setSelectedIds([]); }}>删除所选原料</button></div>}<div className="materialStats">{(["top", "heart", "base"] as Note[]).map(n => <button className={toneFocus === n ? "active" : ""} key={n} onClick={() => setToneFocus(v => v === n ? null : n)} aria-pressed={toneFocus === n}><small>{noteMeta[n].label}</small><b>{visible.filter(m => m.note === n).length}</b><span>{noteMeta[n].sub}</span></button>)}</div><div className="materialSort"><span>排序方式</span><div className="seg"><button className={sortMode === "time" ? "on" : ""} onClick={() => setSortMode("time")}>加入时间</button><button className={sortMode === "note" ? "on" : ""} onClick={() => setSortMode("note")}>前中后调</button></div><div className="seg direction"><button className={sortDirection === "asc" ? "on" : ""} onClick={() => setSortDirection("asc")}>顺序</button><button className={sortDirection === "desc" ? "on" : ""} onClick={() => setSortDirection("desc")}>倒序</button></div>{toneFocus && <em>优先显示{noteMeta[toneFocus].label}</em>}</div><div className="materialGrid">{ordered.map(m => <article className={`editableMaterial ${toneFocus && m.note !== toneFocus ? "toneMuted" : ""}`} key={m.id} onClick={() => onEdit(m)}><label className="materialCheck" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} aria-label={`选择${m.cn}`}/></label><div className={`dot ${m.note}`}/><span className="use">{noteMeta[m.note].label}</span><h3>{m.cn}</h3><p>{m.en}</p>{m.diluted ? <small>{m.concentration}% · {m.solvent}</small> : <small>原液 / 未稀释</small>}<label className="cardGroup" onClick={e => e.stopPropagation()}>分组<select value={m.groupId || ""} onChange={e => onAssign(m.id, e.target.value)}><option value="">未分组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></article>)}<button className="newMaterial" onClick={onAdd}>＋<span>添加新原料</span></button></div></div>;
}
function MaterialModalLegacy({ initial, onClose, onSave }: {
    initial: Material | null;
    onClose: () => void;
    onSave: (m: Material) => void;
}) { const [m, setM] = useState<Material>(initial ? { ...initial } : { id: uid(), cn: "", en: "", note: "top", diluted: false, solvent: "无水乙醇", concentration: "10", createdAt: new Date().toISOString() }); return <div className="modal"><div className="dialog"><div className="modalHead"><div><small>RAW MATERIAL</small><h2>{initial ? "编辑原料" : "添加原料"}</h2></div><button onClick={onClose}>×</button></div><div className="modalForm"><Field label="中文名称"><input autoFocus value={m.cn} onChange={e => setM({ ...m, cn: e.target.value })} placeholder="例如：佛手柑"/></Field><Field label="英文名称"><input value={m.en} onChange={e => setM({ ...m, en: e.target.value })} placeholder="e.g. Bergamot"/></Field><Field label="香调分类"><div className="seg three">{(["top", "heart", "base"] as Note[]).map(n => <button key={n} className={m.note === n ? "on" : ""} onClick={() => setM({ ...m, note: n })}>{noteMeta[n].label}</button>)}</div></Field><label className="check"><input type="checkbox" checked={m.diluted} onChange={e => setM({ ...m, diluted: e.target.checked })}/><span>这是已稀释的香料</span></label>{m.diluted && <div className="twocol"><Field label="溶剂"><input value={m.solvent} onChange={e => setM({ ...m, solvent: e.target.value })}/></Field><Field label="浓度"><div className="unitInput"><input value={m.concentration} onChange={e => setM({ ...m, concentration: e.target.value })}/><b>%</b></div></Field></div>}</div><div className="modalActions"><button onClick={onClose}>取消</button><button className="primary" disabled={!m.cn.trim()} onClick={() => onSave({ ...m, cn: m.cn.trim(), en: m.en.trim() })}>{initial ? "保存修改" : "保存原料"}</button></div></div></div>; }
function FormulaLibrary({ formulas, groups, query, onOpen, onCreate, onCreateVersion, onDelete, onNewGroup, onDeleteGroup, onAssign }: {
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
function MaterialsV2({ materials, groups, query, onAdd, onEdit, onDelete, onNewGroup, onDeleteGroup, onAssign }: {
    materials: Material[];
    groups: Group[];
    query: string;
    onAdd: () => void;
    onEdit: (m: Material) => void;
    onDelete: (ids: string[]) => void;
    onNewGroup: () => void;
    onDeleteGroup: (id: string) => void;
    onAssign: (id: string, tagId: string) => void;
}) {
    const [active, setActive] = useState("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [toneFocus, setToneFocus] = useState<Note | null>(null);
    const [sortMode, setSortMode] = useState<"time" | "note" | "vapor">("time");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [, setVaporWarning] = useState(false);
    const visible = materials.filter(m => (m.cn + m.en).toLowerCase().includes(query.toLowerCase()) && (active === "all" || (active === "ungrouped" ? !tagIdsFor(m).length : tagIdsFor(m).includes(active))));
    const noteOrder: Record<Note, number> = { top: 0, heart: 1, base: 2 };
    const originalOrder = new Map(materials.map((m, i) => [m.id, i]));
    const ordered = [...visible].sort((a, b) => {
        if (toneFocus) {
            const ap = a.note === toneFocus ? 0 : 1;
            const bp = b.note === toneFocus ? 0 : 1;
            if (ap !== bp)
                return ap - bp;
        }
        if(sortMode==="vapor"){
            const valid=(m:Material)=>m.vaporPressure!==undefined&&m.vaporPressure!==""&&Number.isFinite(Number(m.vaporPressure))&&Number(m.vaporPressure)>=0;
            const bucket=(m:Material)=>valid(m)?(Number(m.vaporPressure)>=50?0:Number(m.vaporPressure)>=.5?2:4):(m.note==="top"?1:m.note==="heart"?3:5);
            const ab=bucket(a),bb=bucket(b);if(ab!==bb)return sortDirection==="desc"?ab-bb:bb-ab;
            if(valid(a)&&valid(b))return sortDirection==="desc"?Number(b.vaporPressure)-Number(a.vaporPressure):Number(a.vaporPressure)-Number(b.vaporPressure);
            return 0;
        }
        const av = sortMode === "note" ? noteOrder[a.note] : (a.createdAt ? Date.parse(a.createdAt) : -(originalOrder.get(a.id) || 0));
        const bv = sortMode === "note" ? noteOrder[b.note] : (b.createdAt ? Date.parse(b.createdAt) : -(originalOrder.get(b.id) || 0));
        return sortDirection === "asc" ? av - bv : bv - av;
    });
    const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
    const typeName = (m: Material) => m.materialType === "natural" ? "天然香料" : m.materialType === "accord" ? "香基" : "人工香料";
    const hasVapor=(m:Material)=>m.vaporPressure!==undefined&&m.vaporPressure!==""&&Number.isFinite(Number(m.vaporPressure))&&Number(m.vaporPressure)>=0;
    const chooseVapor=()=>{if(!visible.some(hasVapor)){setVaporWarning(true);return}setVaporWarning(false);setSortMode("vapor")};
    return <div className="materialPage"><div className="titleline"><div><p>原料库</p><h1>我的香料</h1></div><span>{visible.length} 种原料</span></div><GroupBar groups={groups} active={active} onChange={setActive} onNew={onNewGroup} onDelete={id => {
            if (active === id)
                setActive("all");
            onDeleteGroup(id);
        }}/>{selectedIds.length > 0 && <div className="batchBar"><b>已选择 {selectedIds.length} 种原料</b><button onClick={() => setSelectedIds([])}>取消选择</button><button className="batchDelete" onClick={() => { onDelete(selectedIds); setSelectedIds([]); }}>删除所选原料</button></div>}<div className="materialStats">{(["top", "heart", "base"] as Note[]).map(n => <button className={toneFocus === n ? "active" : ""} key={n} onClick={() => setToneFocus(v => v === n ? null : n)}><small>{noteMeta[n].label}</small><b>{visible.filter(m => m.note === n).length}</b><span>{noteMeta[n].sub}</span></button>)}</div><div className="materialSort"><span>排序方式</span><div className="seg"><button className={sortMode === "time" ? "on" : ""} onClick={() => setSortMode("time")}>加入时间</button><button className={sortMode === "note" ? "on" : ""} onClick={() => setSortMode("note")}>前中后调</button></div><div className="seg direction"><button className={sortDirection === "asc" ? "on" : ""} onClick={() => setSortDirection("asc")}>顺序</button><button className={sortDirection === "desc" ? "on" : ""} onClick={() => setSortDirection("desc")}>倒序</button></div>{toneFocus && <em>优先显示{noteMeta[toneFocus].label}</em>}</div><div className="materialGrid">{ordered.map(m => <article className={`editableMaterial ${toneFocus && m.note !== toneFocus ? "toneMuted" : ""}`} key={m.id} onClick={() => onEdit(m)}><label className="materialCheck" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)}/></label><div className={`dot ${m.note}`}/><span className="use">{noteMeta[m.note].label}</span><h3>{m.cn}</h3><p>{m.en}</p><small>{typeName(m)}{m.materialType === "synthetic" && m.vaporPressure ? ` · 蒸气压 ${m.vaporPressure} Pa（25℃）` : ""}</small>{m.diluted ? <small>{m.concentration}% · {m.solvent}</small> : <small>原液 / 未稀释</small>}<div onClick={e => e.stopPropagation()}><TagPicker groups={groups} selected={tagIdsFor(m)} onToggle={tagId => onAssign(m.id, tagId)}/></div></article>)}<button className="newMaterial" onClick={onAdd}>＋<span>添加新原料</span></button></div></div>;
}
function Materials({materials,groups,query,onAdd,onEdit,onDelete,onNewGroup,onDeleteGroup,onAssign}:{materials:Material[];groups:Group[];query:string;onAdd:()=>void;onEdit:(m:Material)=>void;onDelete:(ids:string[])=>void;onNewGroup:()=>void;onDeleteGroup:(id:string)=>void;onAssign:(id:string,tagId:string)=>void}){
    const [active,setActive]=useState("all"),[selectedIds,setSelectedIds]=useState<string[]>([]),[toneFocus,setToneFocus]=useState<Note|null>(null),[typeFocus,setTypeFocus]=useState<"all"|"synthetic"|"natural"|"accord">("all"),[sortMode,setSortMode]=useState<"time"|"note"|"vapor">("time"),[sortDirection,setSortDirection]=useState<"asc"|"desc">("desc"),[vaporWarning,setVaporWarning]=useState(false);
    const hasVapor=(m:Material)=>m.vaporPressure!==undefined&&m.vaporPressure!==""&&Number.isFinite(Number(m.vaporPressure))&&Number(m.vaporPressure)>=0;
    const scoped=materials.filter(m=>(m.cn+m.en).toLowerCase().includes(query.toLowerCase())&&(active==="all"||(active==="ungrouped"?!tagIdsFor(m).length:tagIdsFor(m).includes(active))));
    const visible=scoped.filter(m=>typeFocus==="all"||(m.materialType||"synthetic")===typeFocus);
    const noteOrder:Record<Note,number>={top:0,heart:1,base:2},originalOrder=new Map(materials.map((m,i)=>[m.id,i]));
    const ordered=[...visible].sort((a,b)=>{if(toneFocus){const ap=a.note===toneFocus?0:1,bp=b.note===toneFocus?0:1;if(ap!==bp)return ap-bp}if(sortMode==="vapor"){const bucket=(m:Material)=>hasVapor(m)?(Number(m.vaporPressure)>=50?0:Number(m.vaporPressure)>=.5?2:4):(m.note==="top"?1:m.note==="heart"?3:5),ab=bucket(a),bb=bucket(b);if(ab!==bb)return sortDirection==="desc"?ab-bb:bb-ab;if(hasVapor(a)&&hasVapor(b))return sortDirection==="desc"?Number(b.vaporPressure)-Number(a.vaporPressure):Number(a.vaporPressure)-Number(b.vaporPressure);return 0}const av=sortMode==="note"?noteOrder[a.note]:(a.createdAt?Date.parse(a.createdAt):-(originalOrder.get(a.id)||0)),bv=sortMode==="note"?noteOrder[b.note]:(b.createdAt?Date.parse(b.createdAt):-(originalOrder.get(b.id)||0));return sortDirection==="asc"?av-bv:bv-av});
    const toggle=(id:string)=>setSelectedIds(ids=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id]),typeName=(m:Material)=>m.materialType==="natural"?"天然香料":m.materialType==="accord"?"香基":"人工香料",chooseVapor=()=>{if(!visible.some(hasVapor)){setVaporWarning(true);return}setVaporWarning(false);setSortMode("vapor")};
    const typeOptions=[["all","全部"],["synthetic","人工香料"],["natural","天然香料"],["accord","香基"]] as const;
    return <div className="materialPage">
      <div className="titleline"><div><p>原料库</p><h1>我的香料</h1></div><span>{visible.length} 种原料</span></div>
      <GroupBar groups={groups} active={active} onChange={setActive} onNew={onNewGroup} onDelete={id=>{if(active===id)setActive("all");onDeleteGroup(id)}}/>
      <div className="materialTypeFilters">{typeOptions.map(([value,label])=><button key={value} className={typeFocus===value?"on":""} onClick={()=>setTypeFocus(value)} aria-pressed={typeFocus===value}><span>{label}</span><b>{scoped.filter(m=>value==="all"||(m.materialType||"synthetic")===value).length}</b></button>)}</div>
      {selectedIds.length>0&&<div className="batchBar"><b>已选择 {selectedIds.length} 种原料</b><button onClick={()=>setSelectedIds([])}>取消选择</button><button className="batchDelete" onClick={()=>{onDelete(selectedIds);setSelectedIds([])}}>删除所选原料</button></div>}
      <div className="materialStats">{(["top","heart","base"] as Note[]).map(n=><button className={toneFocus===n?"active":""} key={n} onClick={()=>setToneFocus(v=>v===n?null:n)}><small>{noteMeta[n].label}</small><b>{visible.filter(m=>m.note===n).length}</b><span>{noteMeta[n].sub}</span></button>)}</div>
      <div className="materialSort"><span>排序方式</span><div className="seg sortKinds"><button className={sortMode==="time"?"on":""} onClick={()=>{setSortMode("time");setVaporWarning(false)}}>加入时间</button><button className={sortMode==="note"?"on":""} onClick={()=>{setSortMode("note");setVaporWarning(false)}}>前中后调</button><button className={sortMode==="vapor"?"on":""} onClick={chooseVapor}>蒸气压</button></div><div className="seg direction"><button className={sortDirection==="asc"?"on":""} onClick={()=>setSortDirection("asc")}>顺序</button><button className={sortDirection==="desc"?"on":""} onClick={()=>setSortDirection("desc")}>倒序</button></div>{toneFocus&&<em>优先显示{noteMeta[toneFocus].label}</em>}</div>
      {vaporWarning&&<div className="sortWarning"><b>无法按蒸气压排序</b><span>当前范围内的原料均未设置有效蒸气压，已保留原排序方式。</span></div>}
      <div className="materialGrid">{ordered.map(m=><article className={`editableMaterial ${toneFocus&&m.note!==toneFocus?"toneMuted":""} ${sortMode==="vapor"&&!hasVapor(m)?"vaporMuted":""}`} key={m.id} onClick={()=>onEdit(m)}><label className="materialCheck" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(m.id)} onChange={()=>toggle(m.id)}/></label><div className={`dot ${m.note}`}/><span className="use">{noteMeta[m.note].label}</span><h3>{m.cn}</h3><p>{m.en}</p><div className="materialTypeMeta"><small>{typeName(m)}</small>{m.materialType==="synthetic"&&m.vaporPressure&&<small>蒸气压 {m.vaporPressure} Pa（25℃）</small>}</div>{m.diluted?<small>{m.concentration}% · {m.solvent}</small>:<small>原液 / 未稀释</small>}<TagDisplay groups={groups} selected={tagIdsFor(m)}/></article>)}<button className="newMaterial" onClick={onAdd}>＋<span>添加新原料</span></button></div>
    </div>;
}

function MaterialModalCore({ initial, onClose, onSave }: {
    initial: Material | null;
    onClose: () => void;
    onSave: (m: Material) => void;
}) {
    const [m, setM] = useState<Material>(initial ? { materialType: "synthetic", ...initial } : { id: uid(), cn: "", en: "", note: "top", diluted: false, solvent: "无水乙醇", concentration: "10", materialType: "synthetic", vaporPressure: "", createdAt: new Date().toISOString() });
    return <div className="modal"><div className="dialog"><div className="modalHead"><div><small>RAW MATERIAL</small><h2>{initial ? "编辑原料" : "添加原料"}</h2></div><button onClick={onClose}>×</button></div><div className="modalForm"><Field label="中文名称"><input autoFocus value={m.cn} onChange={e => setM({ ...m, cn: e.target.value })}/></Field><Field label="英文名称"><input value={m.en} onChange={e => setM({ ...m, en: e.target.value })}/></Field><Field label="香料类型"><div className="seg three">{([['synthetic', '人工香料'], ['natural', '天然香料'], ['accord', '香基']] as const).map(([value, label]) => <button key={value} className={m.materialType === value ? "on" : ""} onClick={() => setM({ ...m, materialType: value, vaporPressure: value === "synthetic" ? m.vaporPressure : "" })}>{label}</button>)}</div></Field>{m.materialType === "synthetic" && <Field label="蒸气压（25℃）"><div className="unitInput"><input type="number" min="0" step="any" value={m.vaporPressure || ""} onChange={e => setM({ ...m, vaporPressure: e.target.value })}/><b>Pa</b></div></Field>}<Field label="香调分类"><div className="seg three">{(["top", "heart", "base"] as Note[]).map(n => <button key={n} className={m.note === n ? "on" : ""} onClick={() => setM({ ...m, note: n })}>{noteMeta[n].label}</button>)}</div></Field><label className="check"><input type="checkbox" checked={m.diluted} onChange={e => setM({ ...m, diluted: e.target.checked })}/><span>这是已稀释的香料</span></label>{m.diluted && <div className="twocol"><Field label="溶剂"><input value={m.solvent} onChange={e => setM({ ...m, solvent: e.target.value })}/></Field><Field label="浓度"><div className="unitInput"><input value={m.concentration} onChange={e => setM({ ...m, concentration: e.target.value })}/><b>%</b></div></Field></div>}</div><div className="modalActions"><button onClick={onClose}>取消</button><button className="primary" disabled={!m.cn.trim()} onClick={() => onSave({ ...m, cn: m.cn.trim(), en: m.en.trim() })}>{initial ? "保存修改" : "保存原料"}</button></div></div></div>;
}
function MaterialModal({ initial, groups, onCreateTag, onClose, onSave }: {
    initial: Material | null;
    groups: Group[];
    onCreateTag: (name: string) => Promise<string>;
    onClose: () => void;
    onSave: (m: Material) => Promise<void> | void;
}) {
    const [m,setM]=useState<Material>(initial?{materialType:"synthetic",...initial}:{id:uid(),cn:"",en:"",note:"top",diluted:false,solvent:"无水乙醇",concentration:"10",materialType:"synthetic",vaporPressure:"",tagIds:[],createdAt:new Date().toISOString()});
    const [lookup,setLookup]=useState<"idle"|"loading"|"success"|"notice"|"error">("idle");
    const [message,setMessage]=useState("");
    const [saveMessage,setSaveMessage]=useState("");
    const [lookupSettings,setLookupSettings]=useState<VaporSettings>(defaultVaporSettings);
    const [settingsOpen,setSettingsOpen]=useState(false);
    const [settingsStatus,setSettingsStatus]=useState("");
    useEffect(()=>{syncLocalStore("list").then((data:{settings?:VaporSettings[]})=>{const saved=data.settings?.find(item=>item.id==="vapor_lookup");if(saved?.sources?.length)setLookupSettings(saved)}).catch(()=>{})},[]);
    const updateSource=(id:string,patch:Partial<VaporSource>)=>setLookupSettings(value=>({...value,sources:value.sources.map(source=>source.id===id?{...source,...patch}:source)}));
    const moveSource=(index:number,direction:-1|1)=>setLookupSettings(value=>{const next=[...value.sources],target=index+direction;if(target<0||target>=next.length)return value;[next[index],next[target]]=[next[target],next[index]];return{...value,sources:next}});
    const addSource=()=>setLookupSettings(value=>({...value,sources:[...value.sources,{id:uid(),name:"自定义网站",url:"https://"}]}));
    const saveLookupSettings=async()=>{setSettingsStatus("正在保存…");try{const cleaned={...lookupSettings,sources:lookupSettings.sources.map(source=>({...source,name:source.name.trim()||"自定义网站",url:source.url.trim()})).filter(source=>/^https?:\/\//i.test(source.url))};if(!cleaned.sources.length)throw new Error("请至少保留一个有效网址。");await syncLocalStore("save",{kind:"settings",record:cleaned});setLookupSettings(cleaned);setSettingsStatus("设置已保存")}catch(error){setSettingsStatus(error instanceof Error?error.message:"保存失败")}};
    const toggleTag=(id:string)=>setM(v=>{const ids=tagIdsFor(v);return{...v,groupId:undefined,tagIds:ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]}});
    const autoFill=async()=>{setLookup("notice");setMessage("桌面版暂未接入在线查询，请先手动填写；该功能会在后续本地服务层中恢复。");};
    const save=async()=>{setSaveMessage("");try{const {latinName:_latinName,cas:_cas,supplier:_supplier,referenceUrl:_referenceUrl,...record}=m;await onSave({...record,cn:m.cn.trim(),en:m.en.trim()})}catch(error){setSaveMessage(error instanceof Error?error.message:"保存失败，请稍后重试。")}};
    if(settingsOpen)return <div className="modal"><div className="dialog vaporSettingsDialog"><div className="modalHead"><div><small>LOOKUP SETTINGS</small><h2>蒸气压爬取设置</h2></div><button onClick={()=>setSettingsOpen(false)}>×</button></div><div className="modalForm"><p className="settingsHint">从上到下表示优先级。明确的25℃数据会优先于非25℃结果。</p><div className="sourceList">{lookupSettings.sources.map((source,index)=><div className="sourceItem" key={source.id}><span>{index+1}</span><div><input aria-label="网站名称" value={source.name} onChange={e=>updateSource(source.id,{name:e.target.value})}/><input aria-label="网站网址" value={source.url} onChange={e=>updateSource(source.id,{url:e.target.value})}/></div><div className="sourceActions"><button disabled={index===0} onClick={()=>moveSource(index,-1)}>↑</button><button disabled={index===lookupSettings.sources.length-1} onClick={()=>moveSource(index,1)}>↓</button><button disabled={lookupSettings.sources.length===1} onClick={()=>setLookupSettings(value=>({...value,sources:value.sources.filter(item=>item.id!==source.id)}))}>−</button></div></div>)}</div><button className="addSourceButton" onClick={addSource}>＋ 添加爬取网站</button><label className="fallbackSwitch"><input type="checkbox" checked={lookupSettings.broadSearch} onChange={e=>setLookupSettings(value=>({...value,broadSearch:e.target.checked}))}/><span><b>允许全网兜底搜索</b><small>默认网站均无结果时，再尝试其它网址和搜索引擎。查询时间可能更长。</small></span></label>{settingsStatus&&<small className="settingsStatus">{settingsStatus}</small>}</div><div className="modalActions"><button onClick={()=>setSettingsOpen(false)}>返回</button><button className="primary" onClick={saveLookupSettings}>保存设置</button></div></div></div>;
    return <div className="modal"><div className="dialog"><div className="modalHead"><div><small>RAW MATERIAL</small><h2>{initial?"编辑原料":"添加原料"}</h2></div><button onClick={onClose}>×</button></div><div className="modalForm"><Field label="中文名称"><input autoFocus value={m.cn} onChange={e=>setM({...m,cn:e.target.value})}/></Field><Field label="英文名称"><input value={m.en} onChange={e=>setM({...m,en:e.target.value})}/></Field><Field label="香料类型"><div className="seg three">{([['synthetic','人工香料'],['natural','天然香料'],['accord','香基']] as const).map(([value,label])=><button key={value} className={m.materialType===value?"on":""} onClick={()=>setM({...m,materialType:value,vaporPressure:value==="synthetic"?m.vaporPressure:""})}>{label}</button>)}</div></Field>{m.materialType==="synthetic"&&<Field label="蒸气压（25℃）"><div className="vaporLookupRow"><div className="unitInput"><input type="number" min="0" step="any" value={m.vaporPressure||""} onChange={e=>setM({...m,vaporPressure:e.target.value})}/><b>Pa</b></div><button type="button" disabled={lookup==="loading"||(!m.cn.trim()&&!m.en.trim())} onClick={autoFill}>{lookup==="loading"?"查询中…":"自动补全"}</button><button type="button" className="lookupSettingsButton" onClick={()=>setSettingsOpen(true)} aria-label="蒸气压爬取设置">设置</button></div>{message&&<small className={`vaporLookupMessage ${lookup}`}>{message}</small>}</Field>}<Field label="香调分类"><div className="seg three">{(["top","heart","base"] as Note[]).map(n=><button key={n} className={m.note===n?"on":""} onClick={()=>setM({...m,note:n})}>{noteMeta[n].label}</button>)}</div></Field><label className="check"><input type="checkbox" checked={m.diluted} onChange={e=>setM({...m,diluted:e.target.checked})}/><span>这是已稀释的香料</span></label>{m.diluted&&<div className="twocol"><Field label="溶剂"><input value={m.solvent} onChange={e=>setM({...m,solvent:e.target.value})}/></Field><Field label="浓度"><div className="unitInput"><input value={m.concentration} onChange={e=>setM({...m,concentration:e.target.value})}/><b>%</b></div></Field></div>}<TagEditor groups={groups} selected={tagIdsFor(m)} onToggle={toggleTag} onCreate={onCreateTag}/>{saveMessage&&<div className="sortWarning"><b>{saveMessage}</b></div>}</div><div className="modalActions"><button onClick={onClose}>取消</button><button className="primary" disabled={!m.cn.trim()} onClick={save}>{initial?"保存修改":"保存原料"}</button></div></div></div>;
}

function MaterialModalOld({ initial, groups, onCreateTag, onClose, onSave }: {
    initial: Material | null;
    groups: Group[];
    onCreateTag: (name: string) => Promise<string>;
    onClose: () => void;
    onSave: (m: Material) => void;
}) {
    const [m, setM] = useState<Material>(initial ? { materialType: "synthetic", ...initial } : { id: uid(), cn: "", en: "", note: "top", diluted: false, solvent: "无水乙醇", concentration: "10", materialType: "synthetic", vaporPressure: "", tagIds: [], createdAt: new Date().toISOString() });
    const toggleTag = (id: string) => setM(v => { const ids = tagIdsFor(v); return { ...v, groupId: undefined, tagIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] }; });
    return <div className="modal"><div className="dialog"><div className="modalHead"><div><small>RAW MATERIAL</small><h2>{initial ? "编辑原料" : "添加原料"}</h2></div><button onClick={onClose}>×</button></div><div className="modalForm"><Field label="中文名称"><input autoFocus value={m.cn} onChange={e => setM({ ...m, cn: e.target.value })}/></Field><Field label="英文名称"><input value={m.en} onChange={e => setM({ ...m, en: e.target.value })}/></Field><Field label="香料类型"><div className="seg three">{([['synthetic', '人工香料'], ['natural', '天然香料'], ['accord', '香基']] as const).map(([value, label]) => <button key={value} className={m.materialType === value ? "on" : ""} onClick={() => setM({ ...m, materialType: value, vaporPressure: value === "synthetic" ? m.vaporPressure : "" })}>{label}</button>)}</div></Field>{m.materialType === "synthetic" && <Field label="蒸气压（25℃）"><div className="unitInput"><input type="number" min="0" step="any" value={m.vaporPressure || ""} onChange={e => setM({ ...m, vaporPressure: e.target.value })}/><b>Pa</b></div></Field>}<Field label="香调分类"><div className="seg three">{(["top", "heart", "base"] as Note[]).map(n => <button key={n} className={m.note === n ? "on" : ""} onClick={() => setM({ ...m, note: n })}>{noteMeta[n].label}</button>)}</div></Field><label className="check"><input type="checkbox" checked={m.diluted} onChange={e => setM({ ...m, diluted: e.target.checked })}/><span>这是已稀释的香料</span></label>{m.diluted && <div className="twocol"><Field label="溶剂"><input value={m.solvent} onChange={e => setM({ ...m, solvent: e.target.value })}/></Field><Field label="浓度"><div className="unitInput"><input value={m.concentration} onChange={e => setM({ ...m, concentration: e.target.value })}/><b>%</b></div></Field></div>}<TagEditor groups={groups} selected={tagIdsFor(m)} onToggle={toggleTag} onCreate={onCreateTag}/></div><div className="modalActions"><button onClick={onClose}>取消</button><button className="primary" disabled={!m.cn.trim()} onClick={() => onSave({ ...m, cn: m.cn.trim(), en: m.en.trim() })}>{initial ? "保存修改" : "保存原料"}</button></div></div></div>;
}
function GroupModal({ kind, onClose, onSave }: {
    kind: Group["kind"];
    onClose: () => void;
    onSave: (name: string) => void;
}) {
    const [name, setName] = useState("");
    return <div className="modal"><div className="dialog groupDialog"><div className="modalHead"><div><small>TAG</small><h2>新建{kind === "formula" ? "配方" : "原料"}标签</h2></div><button onClick={onClose}>×</button></div><div className="modalForm"><Field label="标签名称"><input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && name.trim())
                onSave(name.trim());
        }} placeholder="例如：夏季作品"/></Field></div><div className="modalActions"><button onClick={onClose}>取消</button><button className="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>创建标签</button></div></div></div>;
}
