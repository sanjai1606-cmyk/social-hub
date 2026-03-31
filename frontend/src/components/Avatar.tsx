interface AvatarProps {
  url?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  ring?: boolean;
}

export default function Avatar({ url, name, size = 'md', ring = false }: AvatarProps) {
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className={`avatar avatar-${size} ${ring ? 'avatar-ring' : ''}`}>
      {url ? (
        <img src={url} alt={name} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
