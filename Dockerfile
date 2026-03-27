# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Variáveis de build — com valores padrão para quando não forem passadas como ARG
ARG VITE_SUPABASE_URL=https://xcymhcqbyyuozkzhpxgi.supabase.co
ARG VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjeW1oY3FieXl1b3premhweGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTQ2NzcsImV4cCI6MjA4OTk3MDY3N30.j3bFHfPGmGXzfQkGo1WMlRDQYjjDnJONg115xwZSjsQ
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Stage 2: serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: redireciona todas as rotas para index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
