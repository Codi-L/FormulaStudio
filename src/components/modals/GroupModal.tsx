import { useState } from "react";
import type { Group } from "../../domain/models";
import { Field } from "../common/FormControls";

export function GroupModal({ kind, onClose, onSave }: {
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
