import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-heading">Page not found</div>
        <div className="auth-sub">
          The route you requested does not exist or has moved.
        </div>
        <Link href="/" className="auth-btn">
          Back to home
        </Link>
      </div>
    </main>
  );
}
