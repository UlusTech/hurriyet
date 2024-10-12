import "./SettingsField.css";

function Field({ name, values }: { name: string; values: string[] }) {
  return (
    <div className="container">
      <div>{name}</div>
      <div>{values}</div>
    </div>
  );
}

export default Field;
