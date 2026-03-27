# haiku o thuoc (haiku)

website of haiku o thuoc

## Node.js version
This repo now targets Node.js `22+` and should use Node.js `24.x` by default.
Quasar CLI with Vite currently declares official support for Node `22` and `24`, not `25`.

## Install the dependencies
```bash
brew install node@24

# if needed, make node@24 the active version in your shell
brew link --overwrite --force node@24

npm install
```

If you prefer `nvm`, install and use Node `24` before running `npm install`.

### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
npm run dev
```

### Start the API server
```bash
npm run dev:server
```

In local development, Quasar dev server now proxies `/api` requests to `http://localhost:4000` by default.
If your backend runs elsewhere, set `API_PROXY_TARGET` before `npm run dev`.

### Lint the files
```bash
yarn lint
# or
npm run lint
```


### Format the files
```bash
yarn format
# or
npm run format
```



### Build the app for production
```bash
npm run build
```

### Customize the configuration
See [Configuring quasar.config file](https://quasar.dev/quasar-cli-vite/quasar-config-js).
