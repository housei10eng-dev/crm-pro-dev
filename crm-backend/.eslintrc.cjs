module.exports = {
  root: true,
  env: { node: true, jest: true },
  parserOptions: { ecmaVersion: 2021, sourceType: "module" },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
};
