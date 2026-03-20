{{/*
Common labels
*/}}
{{- define "optio.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "optio.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgres://{{ .Values.postgresql.auth.username }}:{{ .Values.postgresql.auth.password }}@{{ .Release.Name }}-postgres:5432/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{ .Values.externalDatabase.url }}
{{- end -}}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "optio.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ .Release.Name }}-redis:6379
{{- else -}}
{{ .Values.externalRedis.url }}
{{- end -}}
{{- end }}
