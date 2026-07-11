import { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n/i18nContext';
import db from '../../db';
import { generateSalt, hashPassword } from '../../utils/auth';
import { Edit2, Save, Trash2, UserPlus, X, Key, ShieldAlert, CheckCircle } from 'lucide-react';

export default function UserManagement({ requirePin, currentUser }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // Form State
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('operator');
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const allUsers = await db.users.toArray();
    setUsers(allUsers);
  }

  const resetForm = () => {
    setEditingId(null);
    setUsername('');
    setDisplayName('');
    setRole('operator');
    setNewPassword('');
    setNewPin('');
    setError('');
  };

  const handleEdit = (user) => {
    setEditingId(user.id);
    setUsername(user.username);
    setDisplayName(user.displayName || '');
    setRole(user.role);
    setNewPassword('');
    setNewPin('');
    setError('');
    setSuccess('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    try {
      const existingUser = await db.users.where('username').equals(username.trim().toLowerCase()).first();
      
      if (editingId) {
        if (existingUser && existingUser.id !== editingId) {
          setError('Username already exists.');
          return;
        }

        const userToUpdate = await db.users.get(editingId);
        let updates = {
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(),
          role
        };

        // Pin confirmation to update sensitive details
        if (newPassword || newPin || role !== userToUpdate.role) {
          const pinConfirmed = await requirePin('Confirm your identity to update user security settings.');
          if (!pinConfirmed) {
             setError('PIN confirmation required to change security settings.');
             return;
          }
        }

        if (newPassword) {
          const passwordSalt = generateSalt();
          updates.passwordHash = await hashPassword(newPassword, passwordSalt);
          updates.passwordSalt = passwordSalt;
        }
        
        if (newPin) {
          if (!/^\d{4}$/.test(newPin)) {
             setError('PIN must be exactly 4 digits.');
             return;
          }
          const pinSalt = generateSalt();
          updates.pinHash = await hashPassword(newPin, pinSalt);
          updates.pinSalt = pinSalt;
        }

        await db.users.update(editingId, updates);
        setSuccess('User updated successfully.');
      } else {
        // Creating new user
        if (existingUser) {
          setError('Username already exists.');
          return;
        }
        if (!newPassword) {
          setError('Password is required for new users.');
          return;
        }
        if (!newPin || !/^\d{4}$/.test(newPin)) {
          setError('4-digit PIN is required for new users.');
          return;
        }

        const pinConfirmed = await requirePin('Confirm your PIN to create a new user.');
        if (!pinConfirmed) return;

        const passwordSalt = generateSalt();
        const pinSalt = generateSalt();
        const passwordHash = await hashPassword(newPassword, passwordSalt);
        const pinHash = await hashPassword(newPin, pinSalt);

        await db.users.add({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(),
          role,
          passwordHash,
          passwordSalt,
          pinHash,
          pinSalt,
          isActive: true,
          createdAt: new Date().toISOString()
        });
        
        setSuccess('User created successfully.');
      }

      await loadUsers();
      resetForm();
    } catch (err) {
      console.error(err);
      setError('An error occurred while saving the user.');
    }
  };

  const handleToggleActive = async (user) => {
    if (user.id === currentUser.id) {
       setError("You cannot deactivate your own account.");
       return;
    }
    
    const pinConfirmed = await requirePin(`Confirm PIN to ${user.isActive ? 'deactivate' : 'activate'} user.`);
    if (!pinConfirmed) return;
    
    await db.users.update(user.id, { isActive: !user.isActive });
    await loadUsers();
  };

  return (
    <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
      <div className="settings-section">
        <div className="settings-section-title" style={{ color: 'var(--accent-purple)' }}>
           <Key size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
           {t('users.title') || 'User Management'}
        </div>

        {error && <div style={{ color: 'var(--accent-red)', marginBottom: 8, fontSize: 13 }}>{error}</div>}
        {success && <div style={{ color: 'var(--accent-emerald)', marginBottom: 8, fontSize: 13 }}>{success}</div>}

        {/* User Form */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: 'var(--space-md)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-lg)'
        }}>
          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
             <div className="form-group" style={{ flex: 1 }}>
               <label className="form-label">{t('users.username') || 'Username'}</label>
               <input className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. op1" />
             </div>
             <div className="form-group" style={{ flex: 1 }}>
               <label className="form-label">{t('users.displayName') || 'Display Name'}</label>
               <input className="form-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Shift 1 Operator" />
             </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
             <div className="form-group" style={{ flex: 1 }}>
               <label className="form-label">{t('users.role') || 'Role'}</label>
               <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                 <option value="operator">Operator (Milk Entry & Dispatches)</option>
                 <option value="manager">Manager (Farmers, Payments, Store, Loans)</option>
                 <option value="admin">Admin (All Access, Settings, Rates)</option>
               </select>
             </div>
             <div className="form-group" style={{ flex: 1 }}>
               <label className="form-label">{t('users.password') || 'Password'}</label>
               <input className="form-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={editingId ? "Leave blank to keep existing" : "Required"} />
             </div>
             <div className="form-group" style={{ flex: 1 }}>
               <label className="form-label">{t('users.pin') || '4-Digit PIN'}</label>
               <input className="form-input mono" maxLength={4} type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder={editingId ? "Leave blank to keep existing" : "Required"} />
             </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
             <button className="btn btn-primary btn-sm" onClick={handleSave}>
               {editingId ? <><Save size={14} /> Update User</> : <><UserPlus size={14} /> Create User</>}
             </button>
             {editingId && (
               <button className="btn btn-ghost btn-sm" onClick={resetForm}>
                 <X size={14} /> Cancel
               </button>
             )}
          </div>
        </div>

        {/* User List */}
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('users.username') || 'Username'}</th>
              <th>{t('users.role') || 'Role'}</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td>
                  <span className={`badge ${u.role === 'admin' ? 'badge-amber' : u.role === 'manager' ? 'badge-cyan' : 'badge-emerald'}`} style={{ textTransform: 'capitalize' }}>
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-emerald' : 'badge-gray'}`}>
                     {u.isActive ? (t('users.active') || 'Active') : (t('users.deactivated') || 'Deactivated')}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleEdit(u)} title="Edit User">
                    <Edit2 size={14} />
                  </button>
                  {u.id !== currentUser.id && (
                     <button 
                       className="btn btn-ghost btn-sm btn-icon" 
                       onClick={() => handleToggleActive(u)}
                       title={u.isActive ? "Deactivate User" : "Activate User"}
                       style={{ color: u.isActive ? 'var(--accent-red)' : 'var(--accent-emerald)' }}
                     >
                       {u.isActive ? <ShieldAlert size={14} /> : <CheckCircle size={14} />}
                     </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
