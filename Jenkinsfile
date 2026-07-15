pipeline {
    agent any

    environment {
        REGISTRY     = 'oghma'
        OGHMA_ENV_DIR = '/home/semyon/jenkins/env'
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
                    env.OGHMA_ENV_FILE = "${OGHMA_ENV_DIR}/oghma-${env.DEPLOY_ENV}.env"
                    env.QUEUE_PREFIX   = env.DEPLOY_ENV == 'prod' ? 'oghma' : 'oghma-dev'
                    echo "branch=${branch}  env=${env.DEPLOY_ENV}  queuePrefix=${env.QUEUE_PREFIX}  image=${env.IMAGE}  worker=${env.WORKER_IMAGE}"
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
                        --env-file $OGHMA_ENV_FILE \
                        -e DEPLOY_ENV=$DEPLOY_ENV \
                        -e QUEUE_PREFIX=$QUEUE_PREFIX \
                        -e QDRANT_URL=http://oghma-qdrant:6333 \
                        -e QDRANT_COLLECTION=oghma_${DEPLOY_ENV}_chunks \
                        $IMAGE \
                        node scripts/prebuild-migrate.mjs
                '''
            }
        }

        stage('drain pending extraction retries') {
            steps {
                sh '''
                    set -eu
                    docker run --rm \
                        --network "$NETWORK" \
                        --env-file "$OGHMA_ENV_FILE" \
                        -e MIGRATION_DATABASE_URL= \
                        -e DEPLOY_ENV="$DEPLOY_ENV" \
                        -e QUEUE_PREFIX="$QUEUE_PREFIX" \
                        -e QDRANT_URL=http://oghma-qdrant:6333 \
                        -e QDRANT_COLLECTION=oghma_${DEPLOY_ENV}_chunks \
                        "$WORKER_IMAGE" \
                        npm run worker:retry-pending
                '''
            }
        }

        stage('deploy app') {
            steps {
                script {
                    def appIp = env.DEPLOY_ENV == 'prod' ? env.PROD_IP : env.DEV_IP
                    sh """
                        set -eu
                        APP_IP="${appIp}"
                        CANDIDATE="\$CONTAINER-candidate-\$BUILD_NUMBER"
                        PREVIOUS="\$CONTAINER-previous-\$BUILD_NUMBER"

                        cleanup_candidate() {
                          docker rm -f "\$CANDIDATE" >/dev/null 2>&1 || true
                        }

                        rollback_app() {
                          echo "[deploy app] rolling back to previous app container if available"
                          docker rm -f "\$CONTAINER" >/dev/null 2>&1 || true
                          if docker inspect "\$PREVIOUS" >/dev/null 2>&1; then
                            docker rename "\$PREVIOUS" "\$CONTAINER" || true
                            docker network connect --ip "\$APP_IP" "\$NETWORK" "\$CONTAINER" >/dev/null 2>&1 || true
                            docker start "\$CONTAINER" >/dev/null
                          fi
                        }

                        trap cleanup_candidate EXIT
                        docker rm -f "\$CANDIDATE" "\$PREVIOUS" >/dev/null 2>&1 || true

                        docker run -d --name "\$CANDIDATE" \
                          --network "\$NETWORK" \
                          --label app=oghma \
                          --label env="\$DEPLOY_ENV" \
                          --label role=app-candidate \
                          --label jenkins-build="\$BUILD_TAG" \
                          --restart no \
                          --env-file "\$OGHMA_ENV_FILE" \
                          -e MIGRATION_DATABASE_URL= \
                          -e DEPLOY_ENV="\$DEPLOY_ENV" \
                          -e QUEUE_PREFIX="\$QUEUE_PREFIX" \
                          -e QDRANT_URL=http://oghma-qdrant:6333 \
                          -e QDRANT_COLLECTION=oghma_\${DEPLOY_ENV}_chunks \
                          --memory "\$APP_MEM" \
                          "\$IMAGE"

                        for attempt in \$(seq 1 "\$LIVE_SMOKE_HEALTH_RETRIES"); do
                          if docker exec "\$CANDIDATE" sh -lc "\$HEALTH_CMD"; then
                            break
                          fi

                          if [ "\$attempt" -eq "\$LIVE_SMOKE_HEALTH_RETRIES" ]; then
                            echo "[deploy app] candidate never became healthy"
                            exit 1
                          fi

                          echo "[deploy app] waiting for candidate health (\${attempt}/\$LIVE_SMOKE_HEALTH_RETRIES)"
                          sleep 2
                        done

                        if docker inspect "\$CONTAINER" >/dev/null 2>&1; then
                          docker stop "\$CONTAINER" >/dev/null
                          docker rename "\$CONTAINER" "\$PREVIOUS"
                          docker network disconnect "\$NETWORK" "\$PREVIOUS" >/dev/null 2>&1 || true
                        fi

                        if ! docker run -d --name "\$CONTAINER" \
                          --network "\$NETWORK" \
                          --ip "\$APP_IP" \
                          --label app=oghma \
                          --label env="\$DEPLOY_ENV" \
                          --label role=app \
                          --label jenkins-build="\$BUILD_TAG" \
                          --restart unless-stopped \
                          --env-file "\$OGHMA_ENV_FILE" \
                          -e MIGRATION_DATABASE_URL= \
                          -e DEPLOY_ENV="\$DEPLOY_ENV" \
                          -e QUEUE_PREFIX="\$QUEUE_PREFIX" \
                          -e QDRANT_URL=http://oghma-qdrant:6333 \
                          -e QDRANT_COLLECTION=oghma_\${DEPLOY_ENV}_chunks \
                          --memory "\$APP_MEM" \
                          "\$IMAGE"; then
                          rollback_app
                          exit 1
                        fi

                        for attempt in \$(seq 1 "\$LIVE_SMOKE_HEALTH_RETRIES"); do
                          if docker exec "\$CONTAINER" sh -lc "\$HEALTH_CMD"; then
                            docker rm -f "\$CANDIDATE" >/dev/null 2>&1 || true
                            echo "deployed \$IMAGE to \$CONTAINER (\$APP_IP)"
                            exit 0
                          fi

                          if [ "\$attempt" -eq "\$LIVE_SMOKE_HEALTH_RETRIES" ]; then
                            echo "[deploy app] final app never became healthy; rolling back"
                            rollback_app
                            exit 1
                          fi

                          echo "[deploy app] waiting for final health (\${attempt}/\$LIVE_SMOKE_HEALTH_RETRIES)"
                          sleep 2
                        done
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
                        set -eu
                        WORKER_IP="${wrkIp}"
                        CANDIDATE="\$WORKER-candidate-\$BUILD_NUMBER"
                        PREVIOUS="\$WORKER-previous-\$BUILD_NUMBER"

                        cleanup_candidate() {
                          docker rm -f "\$CANDIDATE" >/dev/null 2>&1 || true
                        }

                        rollback_worker() {
                          echo "[deploy worker] rolling back to previous worker container if available"
                          docker rm -f "\$WORKER" >/dev/null 2>&1 || true
                          if docker inspect "\$PREVIOUS" >/dev/null 2>&1; then
                            docker rename "\$PREVIOUS" "\$WORKER" || true
                            docker network connect --ip "\$WORKER_IP" "\$NETWORK" "\$WORKER" >/dev/null 2>&1 || true
                            docker start "\$WORKER" >/dev/null
                          fi
                        }

                        trap cleanup_candidate EXIT
                        docker rm -f "\$CANDIDATE" "\$PREVIOUS" >/dev/null 2>&1 || true

                        docker run -d --name "\$CANDIDATE" \
                          --network "\$NETWORK" \
                          --label app=oghma-worker \
                          --label env="\$DEPLOY_ENV" \
                          --label role=worker-candidate \
                          --label jenkins-build="\$BUILD_TAG" \
                          --restart no \
                          --env-file "\$OGHMA_ENV_FILE" \
                          -e MIGRATION_DATABASE_URL= \
                          -e DEPLOY_ENV="\$DEPLOY_ENV" \
                          -e QUEUE_PREFIX="\$QUEUE_PREFIX" \
                          -e QDRANT_URL=http://oghma-qdrant:6333 \
                          -e QDRANT_COLLECTION=oghma_\${DEPLOY_ENV}_chunks \
                          --memory "\$WORKER_MEM" \
                          "\$WORKER_IMAGE"
                        sleep 10
                        if [ "\$(docker inspect -f '{{.State.Running}}' "\$CANDIDATE" 2>/dev/null || true)" != "true" ]; then
                          echo "[deploy worker] candidate worker exited before swap"
                          docker logs "\$CANDIDATE" || true
                          exit 1
                        fi
                        if ! docker exec "\$CANDIDATE" npm run worker:healthcheck; then
                          echo "[deploy worker] candidate worker healthcheck failed"
                          docker logs "\$CANDIDATE" || true
                          exit 1
                        fi

                        if docker inspect "\$WORKER" >/dev/null 2>&1; then
                          docker stop "\$WORKER" >/dev/null
                          docker rename "\$WORKER" "\$PREVIOUS"
                          docker network disconnect "\$NETWORK" "\$PREVIOUS" >/dev/null 2>&1 || true
                        fi

                        if ! docker run -d --name "\$WORKER" \
                          --network "\$NETWORK" \
                          --ip "\$WORKER_IP" \
                          --label app=oghma-worker \
                          --label env="\$DEPLOY_ENV" \
                          --label role=worker \
                          --label jenkins-build="\$BUILD_TAG" \
                          --restart unless-stopped \
                          --env-file "\$OGHMA_ENV_FILE" \
                          -e MIGRATION_DATABASE_URL= \
                          -e DEPLOY_ENV="\$DEPLOY_ENV" \
                          -e QUEUE_PREFIX="\$QUEUE_PREFIX" \
                          -e QDRANT_URL=http://oghma-qdrant:6333 \
                          -e QDRANT_COLLECTION=oghma_\${DEPLOY_ENV}_chunks \
                          --memory "\$WORKER_MEM" \
                          "\$WORKER_IMAGE"; then
                          rollback_worker
                          exit 1
                        fi

                        sleep 10
                        if [ "\$(docker inspect -f '{{.State.Running}}' "\$WORKER" 2>/dev/null || true)" != "true" ]; then
                          echo "[deploy worker] final worker exited after swap; rolling back"
                          docker logs "\$WORKER" || true
                          rollback_worker
                          exit 1
                        fi
                        if ! docker exec "\$WORKER" npm run worker:healthcheck; then
                          echo "[deploy worker] final worker healthcheck failed; rolling back"
                          docker logs "\$WORKER" || true
                          rollback_worker
                          exit 1
                        fi

                        docker rm -f "\$CANDIDATE" >/dev/null 2>&1 || true
                        echo "deployed \$WORKER_IMAGE to \$WORKER (\$WORKER_IP)"
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
                    final String workerIp = env.DEPLOY_ENV == 'prod'
                        ? env.PROD_WRK_IP
                        : env.DEV_WRK_IP
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

                        docker rm -f \
                          "\$CONTAINER-previous-\$BUILD_NUMBER" \
                          "\$WORKER-previous-\$BUILD_NUMBER" \
                          "\$CONTAINER-candidate-\$BUILD_NUMBER" \
                          "\$WORKER-candidate-\$BUILD_NUMBER" \
                          >/dev/null 2>&1 || true
                        echo "[live smoke] passed; cleaned retained rollback containers (${appIp}, ${workerIp})"
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
            sh '''
                set +e
                if [ -z "${DEPLOY_ENV:-}" ]; then
                  exit 0
                fi

                if [ "$DEPLOY_ENV" = "prod" ]; then
                  APP_IP="$PROD_IP"
                  WORKER_IP="$PROD_WRK_IP"
                else
                  APP_IP="$DEV_IP"
                  WORKER_IP="$DEV_WRK_IP"
                fi

                rollback_container() {
                  current="$1"
                  previous="$2"
                  ip="$3"
                  if docker inspect "$previous" >/dev/null 2>&1; then
                    echo "[post failure] rolling back $current from $previous"
                    docker rm -f "$current" >/dev/null 2>&1 || true
                    if docker rename "$previous" "$current"; then
                      docker network connect --ip "$ip" "$NETWORK" "$current" >/dev/null 2>&1 || true
                      docker start "$current" >/dev/null 2>&1 || true
                    fi
                  fi
                }

                rollback_container "$CONTAINER" "$CONTAINER-previous-$BUILD_NUMBER" "$APP_IP"
                rollback_container "$WORKER" "$WORKER-previous-$BUILD_NUMBER" "$WORKER_IP"
                docker rm -f \
                  "$CONTAINER-candidate-$BUILD_NUMBER" \
                  "$WORKER-candidate-$BUILD_NUMBER" \
                  >/dev/null 2>&1 || true
            '''
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
