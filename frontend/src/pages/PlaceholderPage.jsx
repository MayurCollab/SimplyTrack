export default function PlaceholderPage({ title }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This module is pending.
      </p>
    </div>
  )
}
