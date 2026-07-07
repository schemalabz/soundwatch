interface SectionHeaderProps {
  title: string;
  info?: boolean;
  right?: React.ReactNode;
}

export default function SectionHeader({ title, info, right }: SectionHeaderProps) {
  return (
    <div className="px-6 pt-5 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2.5">
        <h3 className="sw-h text-[16px]">{title}</h3>
        {info && (
          <span className="sw-info" title={title}>
            i
          </span>
        )}
      </div>
      {right}
    </div>
  );
}
