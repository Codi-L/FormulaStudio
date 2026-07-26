import { useEffect, useState } from "react";
import type { DesktopPreferences } from "../../platform";

type Props = {
  onDataReload: () => Promise<void>;
  onStorageChanged: (preferences: DesktopPreferences) => void;
};

const emptyPreferences: DesktopPreferences = {
  dataDirectory: "",
  dataFile: "",
  nutstore: { enabled: false, username: "", remoteFile: "/FormulaStudio/FormulaStudio-backup.json", autoSync: true, intervalMinutes: 10, syncOnSave: true, hasPassword: false, lastSyncAt: "", lastSyncError: "" },
};

export function Preferences({ onDataReload, onStorageChanged }: Props) {
  const bridge = window.formulaStudio;
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bridge?.preferences.get().then(value => { setPreferences(value); onStorageChanged(value); }).catch(error => setStatus(error.message));
  }, []);

  if (!bridge) return <div className="preferencesPage"><div className="preferencesIntro"><span>PREFERENCES</span><h1>偏好设置</h1><p>数据路径和坚果云同步仅在 Electron 桌面版中可用。</p></div></div>;

  const updateNutstore = (patch: Partial<DesktopPreferences["nutstore"]>) => setPreferences(value => ({ ...value, nutstore: { ...value.nutstore, ...patch } }));
  const chooseDirectory = async () => {
    const selected = await bridge.preferences.chooseDirectory();
    if (selected) setPreferences(value => ({ ...value, dataDirectory: selected }));
  };
  const save = async () => {
    setBusy(true); setStatus("正在保存…");
    try {
      const saved = await bridge.preferences.save({ dataDirectory: preferences.dataDirectory, nutstore: { ...preferences.nutstore, ...(password ? { password } : {}) } });
      setPreferences(saved); setPassword(""); onStorageChanged(saved); await onDataReload(); setStatus("偏好设置已保存。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败。"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setStatus("正在连接坚果云…");
    try {
      await bridge.nutstore.test({ ...preferences.nutstore, ...(password ? { password } : {}) });
      setStatus("连接成功。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "连接失败。"); }
    finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true); setStatus("正在同步…");
    try {
      const saved = await bridge.preferences.save({
        dataDirectory: preferences.dataDirectory,
        nutstore: { ...preferences.nutstore, ...(password ? { password } : {}) },
      });
      setPreferences(saved);
      setPassword("");
      onStorageChanged(saved);
      const result = await bridge.nutstore.sync();
      if (result.direction === "download") await onDataReload();
      const latest = await bridge.preferences.get(); setPreferences(latest); onStorageChanged(latest);
      setStatus(result.direction === "download" ? `已保留坚果云版本 ID ${result.syncRevision}。` : result.direction === "cancel" ? "已取消同步，本地和云端数据都未更改。" : `已保留本地版本并上传，版本 ID ${result.syncRevision}。`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "同步失败。"); }
    finally { setBusy(false); }
  };

  return <div className="preferencesPage">
    <div className="preferencesIntro"><span>PREFERENCES</span><h1>偏好设置</h1><p>管理本地数据位置，并通过 WebDAV 将完整数据备份同步到坚果云。</p></div>
    <section className="preferenceCard">
      <div className="preferenceHeading"><div><small>LOCAL STORAGE</small><h2>本地数据路径</h2></div><span>数据迁移时会保留当前内容</span></div>
      <label className="pathField"><input readOnly value={preferences.dataDirectory}/><button onClick={chooseDirectory} disabled={busy}>选择文件夹</button></label>
      <p className="pathHint">数据文件：{`${preferences.dataDirectory}\\formula-studio-data.json`}</p>
    </section>
    <section className="preferenceCard">
      <div className="preferenceHeading"><div><small>NUTSTORE WEBDAV</small><h2>坚果云同步</h2></div><label className="switchLabel"><input type="checkbox" checked={preferences.nutstore.enabled} onChange={e => updateNutstore({ enabled: e.target.checked })}/><span>{preferences.nutstore.enabled ? "已启用" : "未启用"}</span></label></div>
      <div className="preferenceGrid">
        <label><span>坚果云账号（邮箱）</span><input value={preferences.nutstore.username} onChange={e => updateNutstore({ username: e.target.value })} placeholder="name@example.com"/></label>
        <label><span>应用密码</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={preferences.nutstore.hasPassword ? "已安全保存；留空表示不更改" : "在坚果云安全选项中生成"}/></label>
        <label className="wide"><span>云端文件路径</span><input value={preferences.nutstore.remoteFile} onChange={e => updateNutstore({ remoteFile: e.target.value })} placeholder="/FormulaStudio/FormulaStudio-backup.json"/></label>
      </div>
      <div className="syncOptions">
        <label className="check preferenceCheck"><input type="checkbox" checked={preferences.nutstore.autoSync} onChange={e => updateNutstore({ autoSync: e.target.checked })}/><span>启用定时自动同步</span></label>
        <label className="frequencyField"><span>自动同步频率</span><input type="number" min="1" step="1" disabled={!preferences.nutstore.autoSync} value={preferences.nutstore.intervalMinutes} onChange={e => updateNutstore({ intervalMinutes: Math.max(1, Number(e.target.value) || 1) })}/><b>分钟</b></label>
        <label className="check preferenceCheck"><input type="checkbox" checked={preferences.nutstore.syncOnSave} onChange={e => updateNutstore({ syncOnSave: e.target.checked })}/><span>保存配方、原料、分组或设置后自动同步</span></label>
      </div>
      <p className="securityHint">请使用坚果云“账户信息 → 安全选项 → 第三方应用管理”生成的应用密码。密码由操作系统加密保存，不会写入数据备份。</p>
      <div className="preferenceActions"><button onClick={test} disabled={busy}>测试连接</button><button onClick={sync} disabled={busy || !preferences.nutstore.enabled}>立即同步</button><button className="primary" onClick={save} disabled={busy}>保存偏好设置</button></div>
      {(status || preferences.nutstore.lastSyncAt || preferences.nutstore.lastSyncError) && <div className={`preferenceStatus ${preferences.nutstore.lastSyncError ? "error" : ""}`}><b>{status || (preferences.nutstore.lastSyncError ? `上次同步失败：${preferences.nutstore.lastSyncError}` : "同步已配置")}</b>{preferences.nutstore.lastSyncAt && <span>上次成功同步：{new Date(preferences.nutstore.lastSyncAt).toLocaleString()}</span>}</div>}
    </section>
  </div>;
}
