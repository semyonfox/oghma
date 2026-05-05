pipeline {
    agent any

    environment {
        REGISTRY     = 'oghma'
        ENV_DIR      = '/home/semyon/jenkins/env'
        NETWORK      = 'oghma'
        HEALTH_CMD   = 'node -e "require(\'http\').get(\'http://localhost:3000/api/health\', r => process.exit(r.statusCode===200?0:1))"'
        MEM_LIMIT    = '512m'
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
                    env.DEPLOY_ENV   = branch == 'main' ? 'prod' : 'dev'
                    env.CONTAINER    = "oghma-${env.DEPLOY_ENV}"
                    env.IMAGE        = "${REGISTRY}:${env.DEPLOY_ENV}-${env.GIT_COMMIT.take(7)}"
                    env.ENV_FILE     = "${ENV_DIR}/oghma-${env.DEPLOY_ENV}.env"
                    echo "branch=${branch}  env=${env.DEPLOY_ENV}  image=${env.IMAGE}"
                }
            }
        }

        stage('build') {
            steps {
                sh 'docker build --label app=oghma --label env=$DEPLOY_ENV -t $IMAGE .'
                sh 'docker tag $IMAGE ${REGISTRY}:${DEPLOY_ENV}-latest'
            }
        }

        stage('migrate') {
            steps {
                // prebuild-migrate.mjs reads MIGRATION_DATABASE_URL from env file
                // falls back to Secrets Manager if not set (not available on homelab)
                sh '''
                    docker run --rm \
                        --network $NETWORK \
                        --env-file $ENV_FILE \
                        $IMAGE \
                        node scripts/prebuild-migrate.mjs
                '''
            }
        }

        stage('deploy') {
            steps {
                script {
                    if (env.DEPLOY_ENV == 'prod') {
                        // zero-downtime: start new → wait healthy → swap (~1s gap, CF tunnel retries handle it)
                        sh '''
                            NEXT="${CONTAINER}-next"

                            # clean up any previous failed attempt
                            docker rm -f "${NEXT}" 2>/dev/null || true

                            # start new container
                            docker run -d --name "${NEXT}" \
                                --network "$NETWORK" \
                                --restart unless-stopped \
                                --env-file "$ENV_FILE" \
                                --memory "$MEM_LIMIT" \
                                --health-cmd "$HEALTH_CMD" \
                                --health-interval 10s \
                                --health-timeout 5s \
                                --health-start-period 60s \
                                --health-retries 3 \
                                "$IMAGE"

                            # wait up to 3 minutes for healthy
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

                            # atomic swap: ~1 second gap
                            docker stop "$CONTAINER" 2>/dev/null || true
                            docker rm   "$CONTAINER" 2>/dev/null || true
                            docker rename "${NEXT}" "$CONTAINER"

                            echo "deployed $IMAGE to $CONTAINER"
                        '''
                    } else {
                        // dev: quick replacement (brief downtime acceptable)
                        sh '''
                            docker stop  "$CONTAINER" 2>/dev/null || true
                            docker rm    "$CONTAINER" 2>/dev/null || true
                            docker run -d --name "$CONTAINER" \
                                --network "$NETWORK" \
                                --restart unless-stopped \
                                --env-file "$ENV_FILE" \
                                --memory "$MEM_LIMIT" \
                                "$IMAGE"
                            echo "deployed $IMAGE to $CONTAINER"
                        '''
                    }
                }
            }
        }

        stage('cleanup') {
            steps {
                // remove untagged images, keep last 3 tagged per env
                sh '''
                    docker image prune -f --filter label=app=oghma
                    docker images --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}" \
                        | grep "^${REGISTRY}:${DEPLOY_ENV}-" \
                        | grep -v latest \
                        | sort -k2 -r \
                        | tail -n +4 \
                        | awk '{print $1}' \
                        | xargs -r docker rmi 2>/dev/null || true
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
