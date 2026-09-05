# Optional — only needed if you want to containerize the backend (e.g. for
# Render/Railway's Docker deploy option). Not required for local development;
# `npm run dev` is simpler for that.

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
