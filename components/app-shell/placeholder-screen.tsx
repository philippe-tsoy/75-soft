import { Card } from "@/components/ui";

interface PlaceholderScreenProps {
  title: string;
  description: string;
}

export function PlaceholderScreen({
  title,
  description,
}: PlaceholderScreenProps) {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center py-8">
      <Card className="w-full text-center">
        <p className="text-primary mb-2 text-sm font-semibold tracking-wide">
          W0 foundation ready
        </p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted mx-auto mt-3 max-w-md text-sm leading-6">
          {description}
        </p>
      </Card>
    </div>
  );
}
