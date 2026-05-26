pipeline {
    agent any

    environment {
        REGISTRY     = 'oghma'
        ENV_DIR      = '/home/semyon/jenkins/env'
        NETWORK      = 'oghma'
        HEALTH_CMD   = 'node -e "require(\'http\').get(\'http://localhost:3000/api/health\', r => process.exit(r.statusCode===200?0:1))"'
        APP_MEM      = '512m'
        WORKER_MEM   = '1536m'
        // fixed IPs — keeps nginx upstreams stable across redeploys
        PROD_IP      = '192.168.48.30'
        PROD_WRK_IP  = '192.168.48.31'
        DEV_IP       = '192.168.48.40'
        DEV_WRK_IP   = '192.168.48.41'
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
                    def appIp = env.DEPLOY_ENV == 'prod' ? env.PROD_IP : env.DEV_IP
                    sh """
                        docker stop  "\$CONTAINER" 2>/dev/null || true
                        docker rm    "\$CONTAINER" 2>/dev/null || true
                        docker run -d --name "\$CONTAINER" \
                            --network "\$NETWORK" \
                            --ip ${appIp} \
                            --restart unless-stopped \
                            --env-file "\$ENV_FILE" \
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
                            --memory "\$WORKER_MEM" \
                            "\$WORKER_IMAGE"
                        echo "deployed \$WORKER_IMAGE to \$WORKER (${wrkIp})"
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
