import React, { useEffect, useState } from 'react';
import type {} from '../shared/api.d';

export const BoardPickerApp: React.FC = () => {
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [expectedName, setExpectedName] = useState('');
  const [selected, setSelected] = useState('');
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    window.api.onInitData((data) => {
      const d = data as { boards: { id: string; name: string }[]; expectedName: string };
      setBoards(d.boards);
      setExpectedName(d.expectedName);
    });
  }, []);

  const handleConfirm = () => {
    if (!selected) return;
    window.api.closeBoardPicker(selected, remember, expectedName);
  };

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', fontSize: 14, color: '#1f2328', padding: '24px 28px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>🔍 Select Board</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#57606a' }}>
        Expected: <code style={{ background: '#f7f8fa', padding: '2px 6px', borderRadius: 4 }}>{expectedName}</code><br />
        Not found. Please select the correct board from your account:
      </p>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 12 }}
      >
        <option value="">— Choose a board —</option>
        {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember this choice for the current month
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          style={{ padding: '8px 18px', fontSize: 13, borderRadius: 6, border: 'none', background: '#3b82d4', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
};
