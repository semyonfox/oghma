pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timestamps()
  }

  triggers {
    githubPush()
  }

  parameters {
    booleanParam(
      name: 'DEPLOY_ONLY',
      defaultValue: false,
      description: 'skip checks and redeploy'
    )
  }

  environment {
    IMAGE_NAME = 'ct216-project-web'
    CONTAINER_NAME = 'ct216-web-1'
    NETWORK = 'ct216_ct216'
    CONTAINER_IP = '172.30.10.10'
    ENV_FILE = '/srv/ct216/stack.env'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout([
          $class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[url: 'https://github.com/semyonfox/CT216-Project.git']]
        ])
      }
    }

    stage('Install') {
      when { expression { !params.DEPLOY_ONLY } }
      steps {
        sh 'npm ci'
      }
    }

    stage('Lint') {
      when { expression { !params.DEPLOY_ONLY } }
      steps {
        sh '''
          if node -e "const s=require('./package.json').scripts||{}; process.exit(s.lint ? 0 : 1)"; then
            npm run lint
          else
            echo "no lint script found, skipping"
          fi
        '''
      }
    }

    stage('Deploy') {
      when {
        expression {
          if (params.DEPLOY_ONLY) return true
          def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
          return branch == 'main' ||
            branch == 'origin/main' ||
            branch == 'refs/heads/main' ||
            branch.endsWith('/main')
        }
      }
      steps {
        sh '''
          docker build -t "$IMAGE_NAME:latest" .
          docker rm -f "$CONTAINER_NAME" || true
          docker run -d \
            --name "$CONTAINER_NAME" \
            --network "$NETWORK" \
            --ip "$CONTAINER_IP" \
            --restart unless-stopped \
            --env-file "$ENV_FILE" \
            "$IMAGE_NAME:latest"
          sleep 5
          docker exec "$CONTAINER_NAME" \
            node -e "require('http').get('http://localhost:3000/api/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) })"
        '''
      }
    }
  }

  post {
    always {
      deleteDir()
    }
  }
}
