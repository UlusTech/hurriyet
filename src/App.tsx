import "./App.css";
import Field from "./components/SettingsField";

function App() {
  return (
    <div className="container">
      "Hürriyet olmayan bir memlekette ölüm ve çöküş vardır."
      <Field name={"Test"} values={["1", "2"]} />
    </div>
  );
}

export default App;
