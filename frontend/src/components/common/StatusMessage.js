export default function StatusMessage({ title, children, tone = 'neutral' }) {
  return (
    <div className={`statusMessage statusMessage-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {children ? <div className="statusMessageBody">{children}</div> : null}
    </div>
  );
}
