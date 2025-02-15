
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY index.ts ./
COPY character.json ./
COPY tsconfig.json ./

RUN npm install
RUN npm run build

CMD ["npm", "start"]
