import type { CompanionProfile as Profile } from '../utils/music';
export function CompanionProfile({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const input = 'w-full rounded-lg border border-stone-700 bg-stone-950 p-2 text-sm mt-1';
  return <section aria-label="个人资料与偏好" className="rounded-2xl border border-stone-800 bg-stone-900/60 p-4 text-stone-300">
    <h4 className="text-sm font-medium">个人资料与偏好</h4>
    <p className="text-xs text-stone-400 my-3">阿屿温暖、懂分寸，会听你说，也会为你挑歌。以下偏好保存在这台设备，交流时提供给模型；城市用于查询天气。留空也能聊天。</p>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <label>怎么称呼你<input className={input} value={profile.name} maxLength={40} onChange={e => onChange({ ...profile, name: e.target.value })}/></label>
      <label>城市<input className={input} value={profile.city} placeholder="用于获取真实天气" maxLength={80} onChange={e => onChange({ ...profile, city: e.target.value })}/></label>
      <label className="col-span-2">当前状态<select className={input} value={profile.workState} onChange={e => onChange({ ...profile, workState: e.target.value })}><option value="未知">暂不填写</option>{['工作专注中','学习中','通勤路上','刚下班','休息放空','运动中','准备睡觉'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="col-span-2">音乐口味与相处偏好<textarea className={input} value={profile.preferences} maxLength={1000} rows={3} placeholder="例如：喜欢陈绮贞，工作时想听无歌词的音乐，累的时候别问太多问题。" onChange={e => onChange({ ...profile, preferences: e.target.value })}/></label>
    </div>
    <button className="mt-3 text-xs text-amber-300" onClick={() => onChange({ name: '', city: '', preferences: '', workState: '未知' })}>清除这些偏好</button>
  </section>;
}
