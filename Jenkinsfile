pipeline {
    agent any

    environment {
        REGISTRY     = 'oghma'
        ENV_DIR      = '/home/semyon/jenkins/env'
        NETWORK      = 'oghma'
        HEALTH_CMD   = 'node -e "require(\'http\').get(\'http://localhost:3000/api/health\', r => process.exit(r.statusCode===200?0:1))"'
        APP_MEM      = '512m'
        WORKER_MEM   = '512m'
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

        stage('migrate') {
            steps {
                sh '''
                    docker run --rm \
                        --network $NETWORK \
                        --env-file $ENV_FILE \
                        $IMAGE \
                        node scripts/prebuild-migrate.mjs
                '''
            }
        }

        stage('deploy app') {
            steps {
                script {
                    if (env.DEPLOY_ENV == 'prod') {
                        // zero-downtime: start new → wait healthy → swap (~1s gap, CF tunnel retries handle it)
                        sh '''
                            NEXT="${CONTAINER}-next"

                            # clean up any previous failed attempt
                            docker rm -f "${NEXT}" 2>/dev/null || true

                            docker run -d --name "${NEXT}" \
                                --network "$NETWORK" \
                                --restart unless-stopped \
                                --env-file "$ENV_FILE" \
                                --memory "$APP_MEM" \
                                --health-cmd "$HEALTH_CMD" \
                                --health-interval 10s \
                                --health-timeout 5s \
                                --health-start-period 60s \
                                --health-retries 3 \
                                "$IMAGE"

                            echo "waiting for ${NEXT} to become healthy..."
                            for i in $(seq 1 36); do
                                STATUS=$(docker inspect -f '{{.State.Health.Status}}' "${NEXT}" 2>/dev/null || echo "missing")
                                printf "  [%02d/36] %s\\n" "$i" "$STATUS"
                                [ "$STATUS" = "healthy" ] && break
                                if [ "$STATUS" = "unhealthy" ]; then
                                    docker logs --tail 30 "${NEXT}"
                                    docker rm -f "${NEXT}"
                                    echo "container unhealthy — aborting deploy"
                                    exit 1
                                fi
                                sleep 5
                            done

                            FINAL=$(docker inspect -f '{{.State.Health.Status}}' "${NEXT}" 2>/dev/null)
                            if [ "$FINAL" != "healthy" ]; then
                                docker rm -f "${NEXT}"
                                echo "timed out waiting for healthy — aborting deploy"
                                exit 1
                            fi

                            docker stop "$CONTAINER" 2>/dev/null || true
                            docker rm   "$CONTAINER" 2>/dev/null || true
                            docker rename "${NEXT}" "$CONTAINER"

                            echo "deployed $IMAGE to $CONTAINER"
                        '''
                    } else {
                        sh '''
                            docker stop  "$CONTAINER" 2>/dev/null || true
                            docker rm    "$CONTAINER" 2>/dev/null || true
                            docker run -d --name "$CONTAINER" \
                                --network "$NETWORK" \
                                --restart unless-stopped \
                                --env-file "$ENV_FILE" \
                                --memory "$APP_MEM" \
                                "$IMAGE"
                            echo "deployed $IMAGE to $CONTAINER"
                        '''
                    }
                }
            }
        }

        stage('deploy worker') {
            steps {
                // BullMQ worker — drains jobs from canvas-import + extract-retry queues.
                // brief downtime is fine on swap; in-flight jobs get retried via DB safety-net.
                sh '''
                    docker stop "$WORKER" 2>/dev/null || true
                    docker rm   "$WORKER" 2>/dev/null || true
                    docker run -d --name "$WORKER" \
                        --network "$NETWORK" \
                        --restart unless-stopped \
                        --env-file "$ENV_FILE" \
                        --memory "$WORKER_MEM" \
                        "$WORKER_IMAGE"
                    echo "deployed $WORKER_IMAGE to $WORKER"
                '''
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
            sh 'docker rm -f "${CONTAINER}-next" 2>/dev/null || true'
        }
        always {
            cleanWs()
        }
    }
}
