import freeSolidSvgIcons from "@fortawesome/free-solid-svg-icons";
import freeBrandsSvgIcons from "@fortawesome/free-brands-svg-icons";

const icons = Object.values(freeSolidSvgIcons.fas).concat(
  Object.values(freeBrandsSvgIcons.fab)
);

const getIcon = (type) => {
  const icon = icons.find((icon) => icon.iconName === type);
  if (icon) {
    return `${icon.prefix} fa-${icon.iconName}`;
  }
  return "fas fa-link";
};

export { getIcon };
