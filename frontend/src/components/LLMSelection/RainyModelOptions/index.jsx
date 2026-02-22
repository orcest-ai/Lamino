export default function RainyModelOptions({ settings }) {
  return (
    <div className="flex flex-col gap-y-7">
      <div className="flex gap-[36px] mt-1.5 flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            Base URL
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
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            API Key
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
            Chat Model Name
          </label>
          <input
            type="text"
            name="RainyModelModelPref"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="rainymodel/auto"
            defaultValue={settings?.RainyModelModelPref}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex gap-[36px] flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            Model context window
          </label>
          <input
            type="number"
            name="RainyModelTokenLimit"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Content window limit (eg: 32768)"
            min={1}
            onScroll={(e) => e.target.blur()}
            defaultValue={settings?.RainyModelTokenLimit}
            required={true}
            autoComplete="off"
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
            placeholder="Max tokens per request (eg: 1024)"
            min={1}
            defaultValue={settings?.RainyModelMaxTokens || 1024}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
