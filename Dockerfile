FROM python:3.13-alpine
# tzdata: zoneinfo needs it on alpine. Non-root user owns nothing but /data.
RUN apk add --no-cache tzdata && adduser -D -u 1000 vault
WORKDIR /app
COPY vault_dashboard/ vault_dashboard/
COPY web/ web/
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER vault
EXPOSE 8080
CMD ["python", "-m", "vault_dashboard"]
