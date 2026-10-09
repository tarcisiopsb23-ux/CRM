# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Build args injetados pelo EasyPanel
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PUBLIC_ORG_ID
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_META_APP_ID
ARG VITE_META_WHATSAPP_CONFIG_ID

# Expõe como ENV para o Vite enxergar durante o build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_PUBLIC_ORG_ID=$VITE_PUBLIC_ORG_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_META_APP_ID=$VITE_META_APP_ID
ENV VITE_META_WHATSAPP_CONFIG_ID=$VITE_META_WHATSAPP_CONFIG_ID

# COPY completo primeiro — garante que mudanças no código invalidam o cache Docker
COPY . .
RUN npm install --legacy-peer-deps
RUN npm run build

# Stage 2: Production (nginx)
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx configurado para SPA (React Router / client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
