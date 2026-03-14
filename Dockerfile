FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

# O comando preview do Vite serve o build de produção na porta 3000 por padrão (ou configurável)
# Ajustado para aceitar conexões externas
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
