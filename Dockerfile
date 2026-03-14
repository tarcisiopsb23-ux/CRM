# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

# Copia os arquivos gerados pelo Vite para o diretório do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Configuração básica do Nginx para Single Page Apps (React/Vite)
# Isso garante que as rotas do react-router funcionem corretamente (redireciona para index.html)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
