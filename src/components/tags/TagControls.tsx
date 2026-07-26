import { useState } from "react";
import type { Group } from "../../domain/models";

export function GroupBar({ groups, active, onChange, onNew, onDelete }: { groups: Group[]; active: string; onChange: (id: string) => void; onNew: () => void; onDelete: (id: string) => void }) {
  return <div className="groupBar"><button className={active === "all" ? "on" : ""} onClick={() => onChange("all")}>全部</button><button className={active === "ungrouped" ? "on" : ""} onClick={() => onChange("ungrouped")}>无标签</button>{groups.map(g => <div className={`groupChip ${active === g.id ? "on" : ""}`} key={g.id}><button onClick={() => onChange(g.id)}>{g.name}</button><button className="deleteGroup" title="删除标签" onClick={() => onDelete(g.id)}>×</button></div>)}<button className="newGroup" onClick={onNew}>＋ 新建标签</button></div>;
}

export function TagDisplay({ groups, selected }: { groups: Group[]; selected: string[] }) {
  const tags = groups.filter(g => selected.includes(g.id));
  return <div className="tagDisplay"><span>标签</span><div>{tags.length ? tags.map(g => <i key={g.id}>{g.name}</i>) : <small>无标签</small>}</div></div>;
}

export function TagPicker({ groups, selected, onToggle }: { groups: Group[]; selected: string[]; onToggle: (id: string) => void }) {
  void onToggle;
  return <TagDisplay groups={groups} selected={selected}/>;
}

export function TagEditor({ groups, selected, onToggle, onCreate }: { groups: Group[]; selected: string[]; onToggle: (id: string) => void; onCreate: (name: string) => Promise<string> }) {
  const [name, setName] = useState("");
  const add = async () => {
    const value = name.trim();
    if (!value) return;
    const existing = groups.find(g => g.name.trim().toLowerCase() === value.toLowerCase());
    const id = existing?.id || await onCreate(value);
    if (!selected.includes(id)) onToggle(id);
    setName("");
  };
  return <div className="tagEditor"><b>标签设置</b><div className="tagChoices">{groups.length ? groups.map(g => <label key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={() => onToggle(g.id)}/>{g.name}</label>) : <small>暂无标签</small>}</div><div className="newTagInline"><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} placeholder="输入新标签名称"/><button type="button" onClick={() => void add()}>＋ 新建并添加</button></div></div>;
}

