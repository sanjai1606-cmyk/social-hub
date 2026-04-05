import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Avatar from './Avatar';
import NotificationBell from './NotificationBell';
import {
  HiOutlineHome,
  HiOutlineMagnifyingGlass,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUser,
  HiOutlineArrowRightOnRectangle,
  HiOutlineUserGroup,
} from 'react-icons/hi2';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { userId, username, displayName, avatarUrl, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', icon: <HiOutlineHome size={22} />, label: 'Feed' },
    { path: '/explore', icon: <HiOutlineMagnifyingGlass size={22} />, label: 'Explore' },
    { path: '/messages', icon: <HiOutlineChatBubbleLeftRight size={22} />, label: 'Messages' },
    { path: '/connections', icon: <HiOutlineUserGroup size={22} />, label: 'Connections' },
    { path: `/profile/${userId}`, icon: <HiOutlineUser size={22} />, label: 'Profile' },
  ];

  return (
    <>
      <div className={`overlay ${isOpen ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🌐</div>
          <span className="sidebar-logo-text">SocialHub</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              onClick={onClose}
              end={item.path === '/'}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          <div style={{ marginTop: '8px' }}>
            <NotificationBell />
          </div>
        </nav>

        <div className="sidebar-profile">
          <Avatar url={avatarUrl || undefined} name={displayName || 'U'} size="md" />
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">{displayName}</div>
            <div className="sidebar-profile-username">@{username}</div>
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleLogout}
            title="Logout"
          >
            <HiOutlineArrowRightOnRectangle size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}
