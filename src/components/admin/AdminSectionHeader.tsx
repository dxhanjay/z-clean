/**
 * Consistent section header for admin pages (admin redesign): the
 * page title in the console's heading colour with a one-line muted
 * subtitle. Rendered inside the AdminShell content column, which
 * already provides width and padding.
 */
export default function AdminSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-[26px] font-extrabold tracking-tight text-admin-heading sm:text-3xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-admin-muted">
          {subtitle}
        </p>
      )}
    </div>
  );
}
