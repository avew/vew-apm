export const sampleHealth = {
  status: "UP",
  components: {
    clientConfigServer: {
      status: "UP",
      details: {
        propertySources: [
          "configserver:file:/data/spring-cloud-config/api-gateway/api-gateway-prod.properties",
          "configClient",
        ],
      },
    },
    discoveryComposite: {
      status: "UP",
      components: {
        discoveryClient: {
          status: "UP",
          details: {
            services: [
              "notif-svc",
              "audit-svc",
              "import-svc",
              "genta-svc",
              "api-gateway-op",
              "billing-svc",
              "scheduler-svc",
              "master-svc",
              "pph-21-svc",
              "pph-svc",
              "report-svc",
              "admin-console-svc",
            ],
          },
        },
        eureka: {
          description: "Remote status from Eureka server",
          status: "UP",
          details: {
            applications: {
              "GENTA-SVC": 1,
              "API-GATEWAY-OP": 1,
              "REPORT-SVC": 1,
              "NOTIF-SVC": 1,
              "SCHEDULER-SVC": 1,
              "PPH-SVC": 1,
              "PPH-21-SVC": 1,
              "IMPORT-SVC": 1,
              "AUDIT-SVC": 1,
              "BILLING-SVC": 1,
              "MASTER-SVC": 1,
              "ADMIN-CONSOLE-SVC": 1,
            },
          },
        },
      },
    },
    diskSpace: {
      status: "UP",
      details: {
        total: 82086711296,
        free: 25162928128,
        threshold: 10485760,
        path: "/.",
        exists: true,
      },
    },
    livenessState: { status: "UP" },
    ping: { status: "UP" },
    reactiveDiscoveryClients: {
      status: "UP",
      components: {
        "Simple Reactive Discovery Client": {
          status: "UP",
          details: { services: [] },
        },
        "Spring Cloud Eureka Reactive Discovery Client": {
          status: "UP",
          details: {
            services: [
              "notif-svc",
              "audit-svc",
              "import-svc",
              "genta-svc",
              "api-gateway-op",
              "billing-svc",
              "scheduler-svc",
              "master-svc",
              "pph-21-svc",
              "pph-svc",
              "report-svc",
              "admin-console-svc",
            ],
          },
        },
      },
    },
    readinessState: { status: "UP" },
    redis: { status: "UP", details: { version: "7.4.7" } },
    refreshScope: { status: "UP" },
  },
  groups: ["liveness", "readiness"],
} as const;
