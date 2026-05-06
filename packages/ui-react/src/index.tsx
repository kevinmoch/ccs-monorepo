import type { ReactNode } from 'react';
export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  children?: ReactNode;
}
export function MetricCard({ title, value, description, children }: MetricCardProps) {
  return (
    <section className="ccs-react-card">
      <div>
        <p className="ccs-react-card__title">{title}</p>
        <strong className="ccs-react-card__value">{value}</strong>
        {description ? <p className="ccs-react-card__desc">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
