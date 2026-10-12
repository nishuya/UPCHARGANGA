const logoImage =
  "https://res.cloudinary.com/piz2jdaa/image/upload/v1791572656/health_logo.png";
const UpcharGangaLogo = ({
  size = 32,
  variant = "default",
  className = "",
}) => {
  // Horizontal logo
  if (variant === "horizontal") {
    return (
      <img
        src={logoImage}
        alt="UpcharGanga"
        width={size}
        height={size * 0.4}
        className={className}
        style={{
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }

  // Stacked logo
  if (variant === "stacked") {
    return (
      <img
        src={logoImage}
        alt="UpcharGanga"
        width={size}
        height={size}
        className={className}
        style={{
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }

  // Default / mark
  return (
    <img
      src={logoImage}
      alt="UpcharGanga"
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: "contain",
        display: "block",
      }}
    />
  );
};

export default UpcharGangaLogo; 