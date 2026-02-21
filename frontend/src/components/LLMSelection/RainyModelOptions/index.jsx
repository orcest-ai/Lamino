import { useState, useEffect } from "react";
import System from "@/models/system";

export default function RainyModelOptions({ settings }) {
  return (
    <div className="flex flex-col gap-y-4 mt-1.5">
      <div className="flex gap-[36px]">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            RainyModel API Base URL
          </label>
          <input
            type="url"
            name="RainyModelBasePath"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="https://rm.orcest.ai/v1"
            defaultValue={
              settings?.RainyModelBasePath || "https://rm.orcest.ai/v1"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            API Key{" "}
            <span className="text-theme-text-secondary font-normal">
              (optional)
            </span>
          </label>
          <input
            type="password"
            name="RainyModelApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="rm-no-key"
            defaultValue={settings?.RainyModelApiKey ? "*".repeat(20) : ""}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      {!settings?.credentialsOnly && (
        <RainyModelModelSelection settings={settings} />
      )}
    </div>
  );
}

function RainyModelModelSelection({ settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findCustomModels() {
      setLoading(true);
      const { models } = await System.customModels("rainymodel");
      setModels(
        models?.length > 0
          ? models
          : [
              { id: "rainymodel/auto" },
              { id: "rainymodel/chat" },
              { id: "rainymodel/code" },
              { id: "rainymodel/agent" },
            ]
      );
      setLoading(false);
    }
    findCustomModels();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-3">
          Chat Model Selection
        </label>
        <select
          name="RainyModelModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            -- loading available models --
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-white text-sm font-semibold block mb-3">
        Chat Model Selection
      </label>
      <select
        name="RainyModelModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option
            key={model.id}
            value={model.id}
            selected={
              settings?.RainyModelModelPref === model.id ||
              (!settings?.RainyModelModelPref &&
                model.id === "rainymodel/auto")
            }
          >
            {model.id}
          </option>
        ))}
      </select>
    </div>
  );
}
