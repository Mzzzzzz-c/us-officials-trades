import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="mt-2 text-muted">页面不存在 · Page not found</p>
      <p className="mt-6 flex justify-center gap-4 text-sm">
        <Link className="link" href="/zh">返回首页</Link>
        <Link className="link" href="/en">Home</Link>
      </p>
    </div>
  );
}
