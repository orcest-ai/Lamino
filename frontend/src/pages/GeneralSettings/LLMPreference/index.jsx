import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import System from "@/models/system";
import showToast from "@/utils/toast";
import LaminoIcon from "@/media/logo/lamino-icon.svg";

// Orcest Ecosystem Provider Logos
import RainyModelLogo from "@/media/llmprovider/rainymodel.svg";
import OllamaLogo from "@/media/llmprovider/ollama.png";
import HuggingFaceLogo from "@/media/llmprovider/huggingface.png";
import DeepSeekLogo from "@/media/llmprovider/deepseek.png";
import GeminiLogo from "@/media/llmprovider/gemini.png";
import OpenRouterLogo from "@/media/llmprovider/openrouter.jpeg";
import OpenAiLogo from "@/media/llmprovider/openai.png";
import AnthropicLogo from "@/media/llmprovider/anthropic.png";
import XAILogo from "@/media/llmprovider/xai.png";
import GenericOpenAiLogo from "@/media/llmprovider/generic-openai.png";

import PreLoader from "@/components/Preloader";
import RainyModelOptions from "@/components/LLMSelection/RainyModelOptions";
import OllamaLLMOptions from "@/components/LLMSelection/OllamaLLMOptions";
import HuggingFaceOptions from "@/components/LLMSelection/HuggingFaceOptions";
import DeepSeekOptions from "@/components/LLMSelection/DeepSeekOptions";
import GeminiLLMOptions from "@/components/LLMSelection/GeminiLLMOptions";
import OpenRouterOptions from "@/components/LLMSelection/OpenRouterOptions";
import OpenAiOptions from "@/components/LLMSelection/OpenAiOptions";
import AnthropicAiOptions from "@/components/LLMSelection/AnthropicAiOptions";
import XAILLMOptions from "@/components/LLMSelection/XAiLLMOptions";
import GenericOpenAiOptions from "@/components/LLMSelection/GenericOpenAiOptions";

import LLMItem from "@/components/LLMSelection/LLMItem";
import { CaretUpDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import CTAButton from "@/components/lib/CTAButton";

/**
 * Cost tier symbols used across Orcest ecosystem.
 * \u{1F7E2} Free | \u{1F3E0} Internal Free | \u{1F310} External Free
 * \u{1F512} Locked | \u{1FA99} Cheap | \u{1F4B2} Normal
 * \u{1F4B0} Too Expensive | \u{1F48E} Most Expensive
 */

export const AVAILABLE_LLM_PROVIDERS = [
  {
    name: "\u{1F7E2} RainyModel (Auto)",
    value: "rainymodel",
    logo: RainyModelLogo,
    options: (settings) => <RainyModelOptions settings={settings} />,
    description: "Orcest AI unified LLM proxy - auto-routes FREE >> INTERNAL >> PREMIUM",
    requiredConfig: ["RainyModelBasePath"],
  },
  {
    name: "\u{1F3E0} Ollama (OllamaFreeAPI / Primary / Secondary)",
    value: "ollama",
    logo: OllamaLogo,
    options: (settings) => <OllamaLLMOptions settings={settings} />,
    description: "Internal Orcest Ollama nodes - free, self-hosted inference",
    requiredConfig: ["OllamaLLMBasePath"],
  },
  {
    name: "\u{1F310} HuggingFace (Spaces)",
    value: "huggingface",
    logo: HuggingFaceLogo,
    options: (settings) => <HuggingFaceOptions settings={settings} />,
    description: "External free tier via HuggingFace Router",
    requiredConfig: [
      "HuggingFaceLLMEndpoint",
      "HuggingFaceLLMAccessToken",
      "HuggingFaceLLMTokenLimit",
    ],
  },
  {
    name: "\u{1FA99} DeepSeek",
    value: "deepseek",
    logo: DeepSeekLogo,
    options: (settings) => <DeepSeekOptions settings={settings} />,
    description: "DeepSeek LLMs - cheap and powerful reasoning models",
    requiredConfig: ["DeepSeekApiKey"],
  },
  {
    name: "\u{1F4B2} Gemini",
    value: "gemini",
    logo: GeminiLogo,
    options: (settings) => <GeminiLLMOptions settings={settings} />,
    description: "Google's largest and most capable AI model",
    requiredConfig: ["GeminiLLMApiKey"],
  },
  {
    name: "\u{1F4B2} OpenRouter",
    value: "openrouter",
    logo: OpenRouterLogo,
    options: (settings) => <OpenRouterOptions settings={settings} />,
    description: "Unified interface for 100+ LLMs - normal cost",
    requiredConfig: ["OpenRouterApiKey"],
  },
  {
    name: "\u{1F4B0} OpenAI",
    value: "openai",
    logo: OpenAiLogo,
    options: (settings) => <OpenAiOptions settings={settings} />,
    description: "GPT models - premium pricing",
    requiredConfig: ["OpenAiKey"],
  },
  {
    name: "\u{1F48E} Claude (Anthropic)",
    value: "anthropic",
    logo: AnthropicLogo,
    options: (settings) => <AnthropicAiOptions settings={settings} />,
    description: "Anthropic Claude models - most expensive tier",
    requiredConfig: ["AnthropicApiKey"],
  },
  {
    name: "\u{1F4B0} Grok (xAI)",
    value: "xai",
    logo: XAILogo,
    options: (settings) => <XAILLMOptions settings={settings} />,
    description: "xAI Grok models - premium pricing",
    requiredConfig: ["XAIApiKey", "XAIModelPref"],
  },
  {
    name: "\u{1F512} Generic OpenAI",
    value: "generic-openai",
    logo: GenericOpenAiLogo,
    options: (settings) => <GenericOpenAiOptions settings={settings} />,
    description: "Connect to any OpenAI-compatible endpoint (advanced)",
    requiredConfig: [
      "GenericOpenAiBasePath",
      "GenericOpenAiModelPref",
      "GenericOpenAiTokenLimit",
      "GenericOpenAiKey",
    ],
  },
];

export const LLM_PREFERENCE_CHANGED_EVENT = "llm-preference-changed";
export default function GeneralLLMPreference() {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredLLMs, setFilteredLLMs] = useState([]);
  const [selectedLLM, setSelectedLLM] = useState(null);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = { LLMProvider: selectedLLM };
    const formData = new FormData(form);

    for (var [key, value] of formData.entries()) data[key] = value;
    const { error } = await System.updateSystem(data);
    setSaving(true);

    if (error) {
      showToast(`Failed to save LLM settings: ${error}`, "error");
    } else {
      showToast("LLM preferences saved successfully.", "success");
    }
    setSaving(false);
    setHasChanges(!!error);
  };

  const updateLLMChoice = (selection) => {
    setSearchQuery("");
    setSelectedLLM(selection);
    setSearchMenuOpen(false);
    setHasChanges(true);
  };

  const handleXButton = () => {
    if (searchQuery.length > 0) {
      setSearchQuery("");
      if (searchInputRef.current) searchInputRef.current.value = "";
    } else {
      setSearchMenuOpen(!searchMenuOpen);
    }
  };

  useEffect(() => {
    async function fetchKeys() {
      const _settings = await System.keys();
      setSettings(_settings);
      setSelectedLLM(_settings?.LLMProvider);
      setLoading(false);
    }
    fetchKeys();
  }, []);

  // Some more complex LLM options do not bubble up the change event, so we need to listen to the custom event
  // we can emit from the LLM options component using window.dispatchEvent(new Event(LLM_PREFERENCE_CHANGED_EVENT));
  useEffect(() => {
    function updateHasChanges() {
      setHasChanges(true);
    }
    window.addEventListener(LLM_PREFERENCE_CHANGED_EVENT, updateHasChanges);
    return () => {
      window.removeEventListener(
        LLM_PREFERENCE_CHANGED_EVENT,
        updateHasChanges
      );
    };
  }, []);

  useEffect(() => {
    const filtered = AVAILABLE_LLM_PROVIDERS.filter((llm) =>
      llm.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLLMs(filtered);
  }, [searchQuery, selectedLLM]);

  const selectedLLMObject = AVAILABLE_LLM_PROVIDERS.find(
    (llm) => llm.value === selectedLLM
  );
  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      {loading ? (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        </div>
      ) : (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <form onSubmit={handleSubmit} className="flex w-full">
            <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
              <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <div className="flex gap-x-4 items-center">
                  <p className="text-lg leading-6 font-bold text-white">
                    {t("llm.title")}
                  </p>
                </div>
                <p className="text-xs leading-[18px] font-base text-white text-opacity-60">
                  {t("llm.description")}
                </p>
              </div>
              <div className="w-full justify-end flex">
                {hasChanges && (
                  <CTAButton
                    onClick={() => handleSubmit()}
                    className="mt-3 mr-0 -mb-14 z-10"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </CTAButton>
                )}
              </div>
              <div className="text-base font-bold text-white mt-6 mb-4">
                {t("llm.provider")}
              </div>
              <div className="relative">
                {searchMenuOpen && (
                  <div
                    className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-70 backdrop-blur-sm z-10"
                    onClick={() => setSearchMenuOpen(false)}
                  />
                )}
                {searchMenuOpen ? (
                  <div className="absolute top-0 left-0 w-full max-w-[640px] max-h-[310px] min-h-[64px] bg-theme-settings-input-bg rounded-lg flex flex-col justify-between cursor-pointer border-2 border-primary-button z-20">
                    <div className="w-full flex flex-col gap-y-1">
                      <div className="flex items-center sticky top-0 z-10 border-b border-[#9CA3AF] mx-4 bg-theme-settings-input-bg">
                        <MagnifyingGlass
                          size={20}
                          weight="bold"
                          className="absolute left-4 z-30 text-theme-text-primary -ml-4 my-2"
                        />
                        <input
                          type="text"
                          name="llm-search"
                          autoComplete="off"
                          placeholder="Search all LLM providers"
                          className="border-none -ml-4 my-2 bg-transparent z-20 pl-12 h-[38px] w-full px-4 py-1 text-sm outline-none text-theme-text-primary placeholder:text-theme-text-primary placeholder:font-medium"
                          onChange={(e) => setSearchQuery(e.target.value)}
                          ref={searchInputRef}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                        />
                        <X
                          size={20}
                          weight="bold"
                          className="cursor-pointer text-white hover:text-x-button"
                          onClick={handleXButton}
                        />
                      </div>
                      <div className="flex-1 pl-4 pr-2 flex flex-col gap-y-1 overflow-y-auto white-scrollbar pb-4 max-h-[245px]">
                        {filteredLLMs.map((llm) => {
                          return (
                            <LLMItem
                              key={llm.name}
                              name={llm.name}
                              value={llm.value}
                              image={llm.logo}
                              description={llm.description}
                              checked={selectedLLM === llm.value}
                              onClick={() => updateLLMChoice(llm.value)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full max-w-[640px] h-[64px] bg-theme-settings-input-bg rounded-lg flex items-center p-[14px] justify-between cursor-pointer border-2 border-transparent hover:border-primary-button transition-all duration-300"
                    type="button"
                    onClick={() => setSearchMenuOpen(true)}
                  >
                    <div className="flex gap-x-4 items-center">
                      <img
                        src={selectedLLMObject?.logo || LaminoIcon}
                        alt={`${selectedLLMObject?.name} logo`}
                        className="w-10 h-10 rounded-md"
                      />
                      <div className="flex flex-col text-left">
                        <div className="text-sm font-semibold text-white">
                          {selectedLLMObject?.name || "None selected"}
                        </div>
                        <div className="mt-1 text-xs text-description">
                          {selectedLLMObject?.description ||
                            "You need to select an LLM"}
                        </div>
                      </div>
                    </div>
                    <CaretUpDown
                      size={24}
                      weight="bold"
                      className="text-white"
                    />
                  </button>
                )}
              </div>
              <div
                onChange={() => setHasChanges(true)}
                className="mt-4 flex flex-col gap-y-1"
              >
                {selectedLLM &&
                  AVAILABLE_LLM_PROVIDERS.find(
                    (llm) => llm.value === selectedLLM
                  )?.options?.(settings)}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
