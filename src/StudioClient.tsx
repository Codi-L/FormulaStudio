"use client";
import { useEffect, useRef, useState } from "react";
import type { Evaluation, Formula, Group, GuestStore, Ingredient, Material, Note } from "./domain/models";
import { emptyEvaluation, emptyFormula, nextVersion, noteMeta, tagIdsFor, today, uid } from "./domain/formula";
import { demoFormula, demoMaterials } from "./domain/fixtures";
import { readGuestStore, replaceGuestStore, syncLocalStore } from "./services/localStore";
import type { DesktopPreferences } from "./platform";
import { Field, ScoreInput, UnitInput } from "./components/common/FormControls";
import { TagEditor } from "./components/tags/TagControls";
import { BlendModal, FormulaLibrary, FormulaReader, NoteSection } from "./features/formulas/FormulaComponents";
import { MaterialModal, Materials } from "./features/materials/MaterialComponents";
import { GroupModal } from "./components/modals/GroupModal";
import { Preferences } from "./features/preferences/Preferences";
export default function StudioClient() {
    const platform = window.formulaStudio?.platform === "darwin" || (!window.formulaStudio && /Mac/.test(navigator.platform)) ? "macos" : "windows";
    const dataSync = (action: string, payload: unknown = {}) => syncLocalStore(action, payload);
    const [tab, setTab] = useState<"formulas" | "editor" | "materials" | "preferences">("formulas");
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
    const [desktopPreferences, setDesktopPreferences] = useState<DesktopPreferences | null>(null);
    const importRef = useRef<HTMLInputElement>(null);
    const [, setHistoryTick] = useState(0);
    const undoRef = useRef<Formula[]>([]);
    const redoRef = useRef<Formula[]>([]);
    const loadData = async () => {
        let x = await dataSync("list") as GuestStore;
        if (window.formulaStudio && !x.formulas.length && !x.materials.length && !x.groups.length && !x.settings.length) {
            const legacy = readGuestStore();
            if (legacy.formulas.length || legacy.materials.length || legacy.groups.length || legacy.settings.length)
                x = await replaceGuestStore(legacy);
            else
                x = await replaceGuestStore({ formulas: [demoFormula], materials: demoMaterials, groups: [], settings: [] });
        }
        const loaded = x as {
            formulas: Formula[];
            materials: Material[];
            groups: Group[];
        };
            if (loaded.formulas.length) {
                setFormulas(loaded.formulas);
                setSelected(loaded.formulas[0].id);
            } else setFormulas([demoFormula]);
            if (loaded.materials.length)
                setMaterials(loaded.materials);
            else setMaterials(demoMaterials);
            if (loaded.groups)
                setGroups(loaded.groups);
    };
    useEffect(() => {
        loadData().catch(() => { });
        window.formulaStudio?.preferences.get().then(setDesktopPreferences).catch(() => {});
        return window.formulaStudio?.storage.onChanged(() => { loadData().catch(() => {}); });
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
    const exportGuestBackup = async () => {
        const envelope = window.formulaStudio ? await window.formulaStudio.storage.backup() : { app: "调香手记" as const, version: 1 as const, syncRevision: 0, exportedAt: new Date().toISOString(), data: await dataSync("list") as GuestStore };
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json;charset=utf-8" });
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
            await replaceGuestStore(next);
            setFormulas(next.formulas.length ? next.formulas : [demoFormula]);
            setMaterials(next.materials.length ? next.materials : demoMaterials);
            setGroups(next.groups);
            setSelected(next.formulas[0]?.id || "f1");
            setTab("formulas");
        } catch { alert("无法读取该备份文件，请确认它来自调香手记。"); }
    };
    return <main className={`platform-${platform}`}>
    <aside>
      <div className="brand homeBrand"><img className="brandmark brandIcon" src={platform === "macos" ? "./app-icon-macos.png" : "./app-icon.png"} alt="调香手记图标"/><div><b>调香手记</b><small>FORMULA STUDIO</small></div></div>
      <nav>
        <button className={tab === "formulas" || tab === "editor" ? "active" : ""} onClick={() => setTab("formulas")}><span>▤</span>配方库<i>{formulas.length}</i></button>
        <button className={tab === "materials" ? "active" : ""} onClick={() => setTab("materials")}><span>◇</span>原料库<i>{materials.length}</i></button>
        <button className={tab === "preferences" ? "active" : ""} onClick={() => setTab("preferences")}><span>⚙</span>偏好设置</button>
      </nav>
      <div className="sidefoot accountFoot localFoot">
        <div className="accountRow"><span className="accountAvatar">{desktopPreferences?.nutstore.enabled ? "云" : "本"}</span><span><b>{desktopPreferences?.nutstore.enabled ? "坚果云同步" : "本地模式"}</b><small>{desktopPreferences?.nutstore.enabled ? "自动同步已配置" : "数据保存在自定义路径"}</small></span></div>
        <div><span className={`syncdot ${desktopPreferences?.nutstore.enabled ? "" : "localDot"}`}/> {desktopPreferences?.nutstore.enabled ? "云端备份已开启" : "自动保存已开启"}</div><div className="guestTools"><button onClick={() => void exportGuestBackup()}>导出备份</button><button onClick={() => importRef.current?.click()}>导入备份</button></div><input ref={importRef} className="hiddenFileInput" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importGuestBackup(file); event.currentTarget.value = ""; }}/>
      </div>
    </aside>
    <section className="workspace">
      <header><div className="mobilebrand">调香手记</div>{tab === "preferences" ? <div className="editorCrumb"><b>偏好设置</b></div> : tab !== "editor" ? <div className="search">⌕ <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tab === "formulas" ? "搜索配方…" : "搜索原料…"}/><kbd>Ctrl K</kbd></div> : <div className="editorCrumb"><button onClick={() => setTab("formulas")}>配方库</button><span>／</span><b>{formula?.name}</b></div>}<div className={`headerStorage ${desktopPreferences?.nutstore.enabled ? "cloud" : "guest"}`}><span>●</span>{desktopPreferences?.nutstore.enabled ? "坚果云同步" : "本机保存"}</div>{tab !== "preferences" && <button className="primary" onClick={tab === "formulas" ? create : tab === "materials" ? () => { setEditingMaterial(null); setMaterialModal(true); } : () => setTab("formulas")}>{tab !== "editor" ? "＋ " : "← "}{tab === "formulas" ? "新建配方" : tab === "materials" ? "添加原料" : "返回配方库"}</button>}</header>
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
        </div>) : tab === "materials" ? <Materials materials={materials} groups={groups.filter(g => g.kind === "material")} query={query} onAdd={() => { setEditingMaterial(null); setMaterialModal(true); }} onEdit={m => { setEditingMaterial(m); setMaterialModal(true); }} onDelete={deleteMaterials} onNewGroup={() => setGroupModal("material")} onDeleteGroup={deleteGroup} onAssign={assignMaterial}/> : <Preferences onDataReload={loadData} onStorageChanged={setDesktopPreferences}/>}
    </section>
    {materialModal && <MaterialModal initial={editingMaterial} groups={groups.filter(g => g.kind === "material")} onCreateTag={name => createInlineTag(name, "material")} onClose={() => { setMaterialModal(false); setEditingMaterial(null); }} onSave={async (m) => { const duplicate=materials.some(v=>v.id!==m.id&&v.cn.trim().toLocaleLowerCase()===m.cn.trim().toLocaleLowerCase()&&v.en.trim().toLocaleLowerCase()===m.en.trim().toLocaleLowerCase()); if(duplicate)throw new Error("已有中文名和英文名均相同的原料，请修改名称后再保存。"); await dataSync("save", { kind: "material", record: m }); setMaterials(x => editingMaterial ? x.map(v => v.id === m.id ? m : v) : [m, ...x]); setMaterialModal(false); setEditingMaterial(null); }}/>} 
    {groupModal && <GroupModal kind={groupModal} onClose={() => setGroupModal(null)} onSave={name => saveGroup(name, groupModal)}/>} 
    {blendOpen && formula && <BlendModal formula={formula} materials={materials} onClose={() => setBlendOpen(false)} onSave={saveBlend}/>}
  </main>;
}
