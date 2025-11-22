import React, { createContext, useContext, useEffect, useState } from "react";

interface BrandConfig {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

interface BrandContextType {
  brandConfig: BrandConfig | null;
  updateBrandConfig: (config: BrandConfig) => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [brandConfig, setBrandConfig] = useState<BrandConfig | null>(null);

  const updateBrandConfig = (config: BrandConfig) => {
    setBrandConfig(config);

    // Update CSS variables immediately
    document.documentElement.style.setProperty(
      "--primary-brand",
      config.primaryColor
    );
    document.documentElement.style.setProperty(
      "--secondary-brand",
      config.secondaryColor
    );

    // Also update localStorage for persistence
    localStorage.setItem("brandConfig", JSON.stringify(config));
  };

  useEffect(() => {
    // Load brand config from localStorage on startup
    const savedConfig = localStorage.getItem("brandConfig");
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      setBrandConfig(config);
      document.documentElement.style.setProperty(
        "--primary-brand",
        config.primaryColor
      );
      document.documentElement.style.setProperty(
        "--secondary-brand",
        config.secondaryColor
      );
    }
  }, []);

  return (
    <BrandContext.Provider value={{ brandConfig, updateBrandConfig }}>
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = () => {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error("useBrand must be used within a BrandProvider");
  }
  return context;
};
