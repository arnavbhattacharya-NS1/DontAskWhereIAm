import React, { useEffect, useState } from 'react';
import type {} from '../shared/api.d';

export const RowPickerApp: React.FC = () => {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [boardName, setBoardName] = useState('');
  const [selected, setSelected] = useState('');

  useEffect(() => {
    window.api.onInitData((data) => {
      const d = data as { items: { id: string; name: string }[]; boardName: string };
      setItems(d.items);
      setBoardName(d.boardName);
    });
  }, []);

  const handleConfirm = () => {
    if (!selected) return;
    const item = items.find((i) => i.id === selected);
    if (item) window.api.closeRowPicker(item.name);
  };

  return (
    <div style={{ fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', fontSize: 14, color: '#1f2328', padding: '24px 28px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>👤 Select Your Row</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#57606a' }}>
        Your name wasn't found in <strong>{boardName}</strong>.<br />
        Please select your row from the list below:
      </p>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 16 }}
      >
        <option value="">— Choose your row —</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <p style={{ fontSize: 11, color: '#57606a', margin: '0 0 16px' }}>
        Your selection will be saved to Settings automatically.
      </p>
      <button
        onClick={handleConfirm}
        disabled={!selected}
        style={{ padding: '8px 18px', fontSize: 13, borderRadius: 6, border: 'none', background: '#3b82d4', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
      >
        Confirm
      </button>
    </div>
  );
};
