import System from "@/models/system";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useState, useEffect } from "react";

export default function RainyModelOptions({ settings }) {
  return (
    <div className="flex flex-col gap-y-4 mt-1.5">
      <div className="flex gap-[36px] flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            RainyModel API Key
          </label>
          <input
            type="password"
            name="RainyModelApiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="RainyModel API Key"
            defaultValue={settings?.RainyModelApiKey ? "*".repeat(20) : ""}
            required={false}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            RainyModel Base URL
          </label>
          <input
            type="url"
            name="RainyModelBasePath"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="https://rm.orcest.ai/v1"
            defaultValue={settings?.RainyModelBasePath}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {!settings?.credentialsOnly && (
          <RainyModelModelSelection settings={settings} />
        )}
      </div>
      <AdvancedControls settings={settings} />
    </div>
  );
}

function AdvancedControls({ settings }) {
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  return (
    <div className="flex flex-col gap-y-4">
      <button
        type="button"
        onClick={() => setShowAdvancedControls(!showAdvancedControls)}
        className="border-none text-white hover:text-white/70 flex items-center text-sm"
      >
        {showAdvancedControls ? "Hide" : "Show"} advanced controls
        {showAdvancedControls ? (
          <CaretUp size={14} className="ml-1" />
        ) : (
          <CaretDown size={14} className="ml-1" />
        )}
      </button>
      <div hidden={!showAdvancedControls}>
        <div className="flex gap-[36px] flex-wrap">
          <div className="flex flex-col w-60">
            <label className="text-white text-sm font-semibold block mb-3">
              Token Context Window
            </label>
            <input
              type="number"
              name="RainyModelTokenLimit"
              className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
              placeholder="32768"
              defaultValue={settings?.RainyModelTokenLimit ?? 32768}
              min={1}
              onScroll={(e) => e.target.blur()}
            />
          </div>
          <div className="flex flex-col w-60">
            <label className="text-white text-sm font-semibold block mb-3">
              Max Tokens
            </label>
            <input
              type="number"
              name="RainyModelMaxTokens"
              className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
              placeholder="1024"
              defaultValue={settings?.RainyModelMaxTokens ?? 1024}
              min={1}
              onScroll={(e) => e.target.blur()}
            />
          </div>
          <div className="flex flex-col w-60">
            <label className="text-white text-sm font-semibold block mb-3">
              Routing Policy
            </label>
            <select
              name="RainyModelPolicy"
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5"
              defaultValue={settings?.RainyModelPolicy ?? "auto"}
            >
              <option value="auto">Auto (FREE &gt;&gt; INTERNAL &gt;&gt; PREMIUM)</option>
              <option value="free">Free Only</option>
              <option value="uncensored">Uncensored (INTERNAL first)</option>
              <option value="premium">Premium (quality first)</option>
            </select>
          </div>
        </div>
      </div>
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
      if (models?.length > 0) {
        setModels(models);
      }
      setLoading(false);
    }
    findCustomModels();
  }, []);

  if (loading || models.length === 0) {
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
            selected={settings?.RainyModelModelPref === model.id}
          >
            {model.costTierSymbol || ""} {model.name || model.id}
            {model.costTier ? ` [${model.costTier}]` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
