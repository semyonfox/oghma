pipeline {
    agent any

    environment {
        REGISTRY     = 'oghma'
        ENV_DIR      = '/home/semyon/jenkins/env'
        NETWORK      = 'oghma'
        HEALTH_CMD   = 'node -e "require(\'http\').get(\'http://localhost:3000/api/health\', r => process.exit(r.statusCode===200?0:1))"'
        APP_MEM      = '512m'
        WORKER_MEM   = '1536m'
        E2E_SMOKE_WORKERS = '1'
        LIVE_SMOKE_HEALTH_RETRIES = '30'
        // fixed IPs — keeps nginx upstreams stable across redeploys
        PROD_IP      = '192.168.48.30'
        PROD_WRK_IP  = '192.168.48.31'
        DEV_IP       = '192.168.48.40'
        DEV_WRK_IP   = '192.168.48.41'
        QDRANT_IP    = '192.168.48.42'
    }

    stages {
        stage('init') {
            steps {
                script {
                    def branch = env.GIT_BRANCH?.replaceFirst(/^origin\//, '') ?: 'unknown'
                    if (branch != 'main' && branch != 'dev') {
                        currentBuild.result = 'ABORTED'
                        error("branch '${branch}' is not main or dev — skipping")
                    }
                    env.DEPLOY_ENV     = branch == 'main' ? 'prod' : 'dev'
                    env.CONTAINER      = "oghma-${env.DEPLOY_ENV}"
                    env.WORKER         = "oghma-${env.DEPLOY_ENV}-worker"
                    env.IMAGE          = "${REGISTRY}:${env.DEPLOY_ENV}-${env.GIT_COMMIT.take(7)}"
                    env.WORKER_IMAGE   = "${REGISTRY}-worker:${env.DEPLOY_ENV}-${env.GIT_COMMIT.take(7)}"
                    env.ENV_FILE       = "${ENV_DIR}/oghma-${env.DEPLOY_ENV}.env"
                    echo "branch=${branch}  env=${env.DEPLOY_ENV}  image=${env.IMAGE}  worker=${env.WORKER_IMAGE}"
                }
            }
        }

        stage('build') {
            parallel {
                stage('app image') {
                    steps {
                        sh 'docker build --label app=oghma --label env=$DEPLOY_ENV -t $IMAGE .'
                        sh 'docker tag $IMAGE ${REGISTRY}:${DEPLOY_ENV}-latest'
                    }
                }
                stage('worker image') {
                    steps {
                        sh 'docker build -f Dockerfile.worker --label app=oghma-worker --label env=$DEPLOY_ENV -t $WORKER_IMAGE .'
                        sh 'docker tag $WORKER_IMAGE ${REGISTRY}-worker:${DEPLOY_ENV}-latest'
                    }
                }
            }
        }

        stage('e2e smoke') {
            steps {
                script {
                    final boolean hadE2EEnv = fileExists('.env.e2e');

                    if (!hadE2EEnv) {
                        sh 'cp .env.e2e.example .env.e2e'
                    }

                    sh 'npm ci --no-audit --no-fund'
                    sh 'npm run e2e:install'

                    try {
                        sh """
                            set -eu
                            npm run e2e:services:up

                            for attempt in \$(seq 1 30); do
                              if npm run e2e:reset; then
                                break
                              fi

                              if [ \"\$attempt\" -eq 30 ]; then
                                echo \"[e2e] reset failed after 30 attempts; keeping logs above\"
                                exit 1
                              fi

                              echo \"[e2e] services not ready yet, retrying reset (\${attempt}/30)\"
                              sleep 2
                            done

                            CI=true npm run test:integration
                            CI=true npm run e2e:smoke -- --workers=${env.E2E_SMOKE_WORKERS}
                        """
                    } finally {
                        sh 'npm run e2e:services:down || true'
                        if (!hadE2EEnv) {
                            sh 'rm -f .env.e2e'
                        }
                    }
                }
            }
        }

        stage('vector store') {
            steps {
                sh '''
                    docker volume create oghma-qdrant-data >/dev/null
                    if ! docker inspect oghma-qdrant >/dev/null 2>&1; then
                      docker run -d --name oghma-qdrant \
                        --network "$NETWORK" \
                        --ip "$QDRANT_IP" \
                        --restart unless-stopped \
                        -v oghma-qdrant-data:/qdrant/storage \
                        qdrant/qdrant:latest
                    else
                      docker start oghma-qdrant >/dev/null
                    fi
                    for attempt in $(seq 1 30); do
                      if curl -fsS "http://${QDRANT_IP}:6333/collections" >/dev/null; then
                        exit 0
                      fi
                      sleep 2
                    done
                    echo "qdrant did not become ready"
                    exit 1
                '''
            }
        }

        stage('migrate') {
            steps {
                sh '''
                    docker run --rm \
                        --network $NETWORK \
                        --env-file $ENV_FILE \
                        -e QDRANT_URL=http://oghma-qdrant:6333 \
                        -e QDRANT_COLLECTION=oghma_${DEPLOY_ENV}_chunks \
                        $IMAGE \
                        node scripts/prebuild-migrate.mjs
                '''
            }
        }

        stage('deploy app') {
            steps {
                script {
                    def appIp = env.DEPLOY_ENV == 'prod' ? env.PROD_IP : env.DEV_IP
                    sh """
                        docker stop  "\$CONTAINER" 2>/dev/null || true
                        docker rm    "\$CONTAINER" 2>/dev/null || true
                        docker run -d --name "\$CONTAINER" \
                            --network "\$NETWORK" \
                            --ip ${appIp} \
                            --restart unless-stopped \
                            --env-file "\$ENV_FILE" \
                            -e QDRANT_URL=http://oghma-qdrant:6333 \
                            -e QDRANT_COLLECTION=oghma_${DEPLOY_ENV}_chunks \
                            --memory "\$APP_MEM" \
                            "\$IMAGE"
                        echo "deployed \$IMAGE to \$CONTAINER (${appIp})"
                    """
                }
            }
        }

        stage('deploy worker') {
            steps {
                // BullMQ worker — drains jobs from canvas-import + extract-retry queues.
                // brief downtime is fine on swap; in-flight jobs get retried via DB safety-net.
                script {
                    def wrkIp = env.DEPLOY_ENV == 'prod' ? env.PROD_WRK_IP : env.DEV_WRK_IP
                    sh """
                        docker stop  "\$WORKER" 2>/dev/null || true
                        docker rm    "\$WORKER" 2>/dev/null || true
                    docker run -d --name "\$WORKER" \
                            --network "\$NETWORK" \
                            --ip ${wrkIp} \
                            --restart unless-stopped \
                            --env-file "\$ENV_FILE" \
                            -e QDRANT_URL=http://oghma-qdrant:6333 \
                            -e QDRANT_COLLECTION=oghma_${DEPLOY_ENV}_chunks \
                            --memory "\$WORKER_MEM" \
                        "\$WORKER_IMAGE"
                    echo "deployed \$WORKER_IMAGE to \$WORKER (${wrkIp})"
                """
                }
            }
        }

        stage('e2e smoke (live)') {
            steps {
                script {
                    final String appIp = env.DEPLOY_ENV == 'prod'
                        ? env.PROD_IP
                        : env.DEV_IP
                    final String appUrl = "http://${appIp}:3000"

                    sh """
                        set -eu
                        for attempt in \$(seq 1 ${env.LIVE_SMOKE_HEALTH_RETRIES}); do
                          if curl -fsS \"${appUrl}/api/health\" >/dev/null; then
                            break
                          fi

                          if [ \"\$attempt\" -eq ${env.LIVE_SMOKE_HEALTH_RETRIES} ]; then
                            echo \"[live smoke] app never reached healthy state at ${appUrl}\"
                            exit 1
                          fi

                          echo \"[live smoke] waiting for app health (\${attempt}/${env.LIVE_SMOKE_HEALTH_RETRIES})\"
                          sleep 2
                        done

                        echo \"[live smoke] running public smoke against ${appUrl}\"
                        PLAYWRIGHT_SKIP_WEB_SERVER=1 \
                          CI=true \
                          E2E_RESET_DB=0 \
                          E2E_CREATE_STORAGE_BUCKET=0 \
                          E2E_BASE_URL=${appUrl} \
                          PLAYWRIGHT_BASE_URL=${appUrl} \
                          NEXT_PUBLIC_APP_URL=${appUrl} \
                          NEXT_PUBLIC_API_URL=${appUrl} \
                          NEXTAUTH_URL=${appUrl} \
                          APP_BASE_URL=${appUrl} \
                          CORS_ORIGINS=${appUrl} \
                          npm run e2e:smoke:public -- --workers=${env.E2E_SMOKE_WORKERS}
                    """
                }
            }
        }

        stage('cleanup') {
            steps {
                sh '''
                    docker image prune -f --filter label=app=oghma
                    docker image prune -f --filter label=app=oghma-worker
                    for repo in "${REGISTRY}" "${REGISTRY}-worker"; do
                      docker images --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}" \
                          | grep "^${repo}:${DEPLOY_ENV}-" \
                          | grep -v latest \
                          | sort -k2 -r \
                          | tail -n +4 \
                          | awk '{print $1}' \
                          | xargs -r docker rmi 2>/dev/null || true
                    done
                '''
            }
        }
    }

    post {
        failure {
            sh 'docker rm -f "$CONTAINER" 2>/dev/null || true'
        }
        always {
            // Workspace Cleanup plugin isn't installed on this jenkins, so
            // cleanWs() raises NoSuchMethodError. catch Throwable (not just
            // Exception) since java.lang.Error sits outside the Exception
            // hierarchy and a bare `catch (err)` lets it through.
            script {
                try {
                    cleanWs()
                } catch (Throwable err) {
                    echo "cleanWs unavailable (plugin not installed): ${err.message}"
                }
            }
        }
    }
}
